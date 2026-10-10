// Copyright 2025 The Casdoor Authors. All Rights Reserved.
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
	"net/http"
	"net/http/httptest"
	"reflect"
	"testing"
)

const awsXmlNs = `xmlns="https://iam.amazonaws.com/doc/2010-05-08/"`

func awsGroupFields(name, id string) string {
	return fmt.Sprintf(`<Path>/</Path><GroupName>%s</GroupName><GroupId>%s</GroupId><Arn>arn:aws:iam::1:group/%s</Arn><CreateDate>2020-01-01T00:00:00Z</CreateDate>`, name, id, name)
}

func awsUserMember(name, id string) string {
	return fmt.Sprintf(`<member><Path>/</Path><UserName>%s</UserName><UserId>%s</UserId><Arn>arn:aws:iam::1:user/%s</Arn><CreateDate>2020-01-01T00:00:00Z</CreateDate></member>`, name, id, name)
}

func TestAwsIamGroupSync(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = r.ParseForm()
		w.Header().Set("Content-Type", "text/xml")
		switch r.Form.Get("Action") {
		case "ListGroups":
			if r.Form.Get("Marker") == "m2" {
				fmt.Fprintf(w, `<ListGroupsResponse %s><ListGroupsResult><IsTruncated>false</IsTruncated><Groups><member>%s</member></Groups></ListGroupsResult></ListGroupsResponse>`, awsXmlNs, awsGroupFields("ops", "AGPA2"))
				return
			}
			fmt.Fprintf(w, `<ListGroupsResponse %s><ListGroupsResult><IsTruncated>true</IsTruncated><Marker>m2</Marker><Groups><member>%s</member></Groups></ListGroupsResult></ListGroupsResponse>`, awsXmlNs, awsGroupFields("dev", "AGPA1"))
		case "GetGroup":
			users := awsUserMember("alice", "AIDA1")
			if r.Form.Get("GroupName") == "dev" {
				users += awsUserMember("bob", "AIDA2")
			}
			fmt.Fprintf(w, `<GetGroupResponse %s><GetGroupResult><IsTruncated>false</IsTruncated><Group>%s</Group><Users>%s</Users></GetGroupResult></GetGroupResponse>`, awsXmlNs, awsGroupFields(r.Form.Get("GroupName"), "x"), users)
		case "ListUsers":
			fmt.Fprintf(w, `<ListUsersResponse %s><ListUsersResult><IsTruncated>false</IsTruncated><Users>%s%s</Users></ListUsersResult></ListUsersResponse>`, awsXmlNs, awsUserMember("alice", "AIDA1"), awsUserMember("bob", "AIDA2"))
		case "ListUserTags":
			fmt.Fprintf(w, `<ListUserTagsResponse %s><ListUserTagsResult><IsTruncated>false</IsTruncated><Tags></Tags></ListUserTagsResult></ListUserTagsResponse>`, awsXmlNs)
		case "ListGroupsForUser":
			if r.Form.Get("UserName") == "bob" {
				fmt.Fprintf(w, `<ListGroupsForUserResponse %s><ListGroupsForUserResult><IsTruncated>false</IsTruncated><Groups><member>%s</member></Groups></ListGroupsForUserResult></ListGroupsForUserResponse>`, awsXmlNs, awsGroupFields("dev", "AGPA1"))
				return
			}
			w.WriteHeader(http.StatusNotFound)
		default:
			w.WriteHeader(http.StatusBadRequest)
		}
	}))
	defer srv.Close()

	awsIamEndpointOverride = srv.URL
	defer func() { awsIamEndpointOverride = "" }()

	p := &AwsIamSyncerProvider{Syncer: &Syncer{Host: "us-east-1", User: "AKIA", Password: "secret"}}

	groups, err := p.GetOriginalGroups()
	if err != nil {
		t.Fatal(err)
	}
	if len(groups) != 2 || groups[0].Name != "dev" || groups[1].Name != "ops" {
		t.Fatalf("unexpected groups: %+v", groups)
	}

	users, err := p.GetOriginalUsers()
	if err != nil {
		t.Fatal(err)
	}
	m := map[string][]string{}
	for _, u := range users {
		m[u.Name] = u.Groups
	}
	// GetGroup is mocked to return alice for every group and bob only for dev
	if !reflect.DeepEqual(m["alice"], []string{"dev", "ops"}) || !reflect.DeepEqual(m["bob"], []string{"dev"}) {
		t.Fatalf("unexpected membership: %v", m)
	}

	// UserId -> UserName mapping is needed for ListGroupsForUser
	ids, err := p.GetOriginalUserGroups("AIDA2")
	if err != nil || !reflect.DeepEqual(ids, []string{"dev"}) {
		t.Fatalf("unexpected user groups %v, err %v", ids, err)
	}
}
