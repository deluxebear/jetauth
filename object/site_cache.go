// Copyright 2023 The casbin Authors. All Rights Reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

package object

import (
	"fmt"
	"strings"
	"sync"

	"github.com/deluxebear/casdoor/util"
	"golang.org/x/sync/semaphore"
)

var (
	siteMapMu                sync.RWMutex
	SiteMap                  = map[string]*Site{}
	certMapMu                sync.RWMutex
	certMap                  = map[string]*Cert{}
	healthCheckNeededDomains []string
	dnsResolveSem            = semaphore.NewWeighted(10) // limit concurrent DNS lookups
)

func InitSiteMap() {
	err := refreshSiteMap()
	if err != nil {
		panic(err)
	}
}

func getCasdoorCertMap() (map[string]*Cert, error) {
	certs, err := GetCerts("")
	if err != nil {
		return nil, fmt.Errorf("GetCerts() error: %s", err.Error())
	}

	res := map[string]*Cert{}
	for _, cert := range certs {
		res[cert.Name] = cert
	}
	return res, nil
}

func getCasdoorApplicationMap() (map[string]*Application, error) {
	casdoorCertMap, err := getCasdoorCertMap()
	if err != nil {
		return nil, err
	}

	applications, err := GetApplications("")
	if err != nil {
		return nil, fmt.Errorf("GetOrganizationApplications() error: %s", err.Error())
	}

	res := map[string]*Application{}
	for _, application := range applications {
		if application.Cert != "" {
			if cert, ok := casdoorCertMap[application.Cert]; ok {
				application.CertObj = cert
			}
		}

		res[application.Name] = application
	}
	return res, nil
}

func refreshSiteMap() error {
	applicationMap, err := getCasdoorApplicationMap()
	if err != nil {
		fmt.Println(err)
	}

	newSiteMap := map[string]*Site{}
	newHealthCheckNeededDomains := make([]string, 0)
	sites, err := GetGlobalSites()
	if err != nil {
		return err
	}

	newCertMap, err := getCertMap()
	if err != nil {
		return err
	}
	certMapMu.Lock()
	certMap = newCertMap
	certMapMu.Unlock()

	for _, site := range sites {
		if applicationMap != nil {
			if site.CasdoorApplication != "" && site.ApplicationObj == nil {
				if v, ok2 := applicationMap[site.CasdoorApplication]; ok2 {
					site.ApplicationObj = v
				}
			}
		}

		if site.Domain != "" && site.PublicIp == "" {
			if dnsResolveSem.TryAcquire(1) {
				go func(site *Site) {
					defer dnsResolveSem.Release(1)
					site.PublicIp = util.ResolveDomainToIp(site.Domain)
					_, err2 := UpdateSiteNoRefresh(site.GetId(), site)
					if err2 != nil {
						fmt.Printf("UpdateSiteNoRefresh() error: %v\n", err2)
					}
				}(site)
			}
		}

		newSiteMap[strings.ToLower(site.Domain)] = site
		if !shouldStopHealthCheck(site) {
			newHealthCheckNeededDomains = append(newHealthCheckNeededDomains, strings.ToLower(site.Domain))
		}
		for _, domain := range site.OtherDomains {
			if domain != "" {
				newSiteMap[strings.ToLower(domain)] = site
			}
		}
	}

	siteMapMu.Lock()
	SiteMap = newSiteMap
	healthCheckNeededDomains = newHealthCheckNeededDomains
	siteMapMu.Unlock()
	return nil
}

func GetSiteByDomain(domain string) *Site {
	siteMapMu.RLock()
	site, ok := SiteMap[strings.ToLower(domain)]
	siteMapMu.RUnlock()
	if ok {
		return site
	}
	return nil
}
