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
	"crypto/tls"
	"crypto/x509"
	"encoding/hex"
	"fmt"
	"strings"
	"unicode/utf8"

	"github.com/deluxebear/jetauth/util"
	goldap "github.com/go-ldap/ldap/v3"
)

// convertGUIDToString converts a binary GUID byte array to a standard UUID string format
// Active Directory GUIDs are 16 bytes in a specific byte order
func convertGUIDToString(guidBytes []byte) string {
	if len(guidBytes) != 16 {
		return ""
	}

	// Active Directory GUID format is:
	// Data1 (4 bytes, little-endian) - Data2 (2 bytes, little-endian) - Data3 (2 bytes, little-endian) - Data4 (2 bytes, big-endian) - Data5 (6 bytes, big-endian)
	// Convert to standard UUID format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
	return fmt.Sprintf("%02x%02x%02x%02x-%02x%02x-%02x%02x-%02x%02x-%02x%02x%02x%02x%02x%02x",
		guidBytes[3], guidBytes[2], guidBytes[1], guidBytes[0], // Data1 (reverse byte order)
		guidBytes[5], guidBytes[4], // Data2 (reverse byte order)
		guidBytes[7], guidBytes[6], // Data3 (reverse byte order)
		guidBytes[8], guidBytes[9], // Data4 (big-endian)
		guidBytes[10], guidBytes[11], guidBytes[12], guidBytes[13], guidBytes[14], guidBytes[15]) // Data5 (big-endian)
}

// sanitizeUTF8 ensures the string contains only valid UTF-8 characters
// Invalid UTF-8 sequences are replaced with the Unicode replacement character
func sanitizeUTF8(s string) string {
	if utf8.ValidString(s) {
		return s
	}

	// Build a new string with only valid UTF-8
	var builder strings.Builder
	builder.Grow(len(s))

	for _, r := range s {
		if r == utf8.RuneError {
			// Skip invalid runes
			continue
		}
		builder.WriteRune(r)
	}

	return builder.String()
}

// getAttributeValueSafe safely retrieves an LDAP attribute value and ensures it's valid UTF-8
func getAttributeValueSafe(entry *goldap.Entry, attributeName string) string {
	value := entry.GetAttributeValue(attributeName)
	return sanitizeUTF8(value)
}

// ActiveDirectorySyncerProvider implements SyncerProvider for Active Directory LDAP-based syncers
type ActiveDirectorySyncerProvider struct {
	Syncer *Syncer
}

// InitAdapter initializes the Active Directory syncer (no database adapter needed)
func (p *ActiveDirectorySyncerProvider) InitAdapter() error {
	// Active Directory syncer doesn't need database adapter
	return nil
}

// GetOriginalUsers retrieves all users from Active Directory via LDAP
func (p *ActiveDirectorySyncerProvider) GetOriginalUsers() ([]*OriginalUser, error) {
	return p.getActiveDirectoryUsers()
}

// AddUser adds a new user to Active Directory (not supported for read-only LDAP)
func (p *ActiveDirectorySyncerProvider) AddUser(user *OriginalUser) (bool, error) {
	// Active Directory syncer is typically read-only
	return false, fmt.Errorf("adding users to Active Directory is not supported")
}

// UpdateUser updates an existing user in Active Directory (not supported for read-only LDAP)
func (p *ActiveDirectorySyncerProvider) UpdateUser(user *OriginalUser) (bool, error) {
	// Active Directory syncer is typically read-only
	return false, fmt.Errorf("updating users in Active Directory is not supported")
}

// TestConnection tests the Active Directory LDAP connection
func (p *ActiveDirectorySyncerProvider) TestConnection() error {
	conn, err := p.getLdapConn()
	if err != nil {
		return err
	}
	defer conn.Close()
	return nil
}

// Close closes any open connections (no-op for Active Directory LDAP-based syncer)
func (p *ActiveDirectorySyncerProvider) Close() error {
	// Active Directory syncer doesn't maintain persistent connections
	// LDAP connections are opened and closed per operation
	return nil
}

// getTlsConfig builds the TLS configuration for LDAPS connections from Syncer.SslMode:
//
//	"verify-full"  verify the certificate chain and the host name
//	"verify-ca"    verify the certificate chain only (host name is not checked)
//	anything else  ("", "require", "disable") encrypt without verifying the server certificate;
//	               this is the behaviour before the option existed and is kept for existing syncers
func (p *ActiveDirectorySyncerProvider) getTlsConfig(host string) *tls.Config {
	switch strings.ToLower(p.Syncer.SslMode) {
	case "verify-full":
		return &tls.Config{ServerName: host, MinVersion: tls.VersionTLS12}
	case "verify-ca":
		return &tls.Config{
			MinVersion: tls.VersionTLS12,
			// The default verification also checks the host name, so it is replaced by
			// a manual chain verification.
			InsecureSkipVerify: true,
			VerifyConnection: func(cs tls.ConnectionState) error {
				if len(cs.PeerCertificates) == 0 {
					return fmt.Errorf("no server certificate presented")
				}
				opts := x509.VerifyOptions{Intermediates: x509.NewCertPool()}
				for _, cert := range cs.PeerCertificates[1:] {
					opts.Intermediates.AddCert(cert)
				}
				_, err := cs.PeerCertificates[0].Verify(opts)
				return err
			},
		}
	default:
		return &tls.Config{InsecureSkipVerify: true}
	}
}

// getLdapConn establishes an LDAP connection to Active Directory
func (p *ActiveDirectorySyncerProvider) getLdapConn() (*goldap.Conn, error) {
	// syncer.Host should be the AD server hostname/IP
	// syncer.Port should be the LDAP port (usually 389 or 636 for LDAPS)
	// syncer.User should be the bind DN or username
	// syncer.Password should be the bind password

	host := p.Syncer.Host
	if host == "" {
		return nil, fmt.Errorf("host is required for Active Directory syncer")
	}

	port := p.Syncer.Port
	if port == 0 {
		port = 389 // Default LDAP port
	}

	user := p.Syncer.User
	if user == "" {
		return nil, fmt.Errorf("user (bind DN) is required for Active Directory syncer")
	}

	password := p.Syncer.Password
	if password == "" {
		return nil, fmt.Errorf("password is required for Active Directory syncer")
	}

	var conn *goldap.Conn
	var err error

	// Check if SSL is enabled (port 636 typically indicates LDAPS)
	if port == 636 {
		conn, err = goldap.DialTLS("tcp", fmt.Sprintf("%s:%d", host, port), p.getTlsConfig(host))
	} else {
		conn, err = goldap.Dial("tcp", fmt.Sprintf("%s:%d", host, port))
	}

	if err != nil {
		return nil, fmt.Errorf("failed to connect to Active Directory: %w", err)
	}

	// Bind with the provided credentials
	err = conn.Bind(user, password)
	if err != nil {
		conn.Close()
		return nil, fmt.Errorf("failed to bind to Active Directory: %w", err)
	}

	return conn, nil
}

// getActiveDirectoryUsers retrieves all users from Active Directory
func (p *ActiveDirectorySyncerProvider) getActiveDirectoryUsers() ([]*OriginalUser, error) {
	conn, err := p.getLdapConn()
	if err != nil {
		return nil, err
	}
	defer conn.Close()

	// Use the Database field to store the base DN for searching
	baseDN := p.Syncer.Database
	if baseDN == "" {
		return nil, fmt.Errorf("database field (base DN) is required for Active Directory syncer")
	}

	// Search filter for user objects in Active Directory
	// Filter for users: objectClass=user, objectCategory=person, and not disabled accounts
	searchFilter := "(&(objectClass=user)(objectCategory=person))"

	// Attributes to retrieve from Active Directory
	attributes := []string{
		"sAMAccountName",     // Username
		"userPrincipalName",  // UPN (email-like format)
		"displayName",        // Display name
		"givenName",          // First name
		"sn",                 // Last name (surname)
		"mail",               // Email address
		"telephoneNumber",    // Phone number
		"mobile",             // Mobile phone
		"title",              // Job title
		"department",         // Department
		"company",            // Company
		"streetAddress",      // Street address
		"l",                  // City/Locality
		"st",                 // State/Province
		"postalCode",         // Postal code
		"co",                 // Country
		"objectGUID",         // Unique identifier
		"whenCreated",        // Creation time
		"userAccountControl", // Account status
		"memberOf",           // Distinguished names of the groups the user is a direct member of
	}

	searchRequest := goldap.NewSearchRequest(
		baseDN,
		goldap.ScopeWholeSubtree,
		goldap.NeverDerefAliases,
		0,     // No size limit
		0,     // No time limit
		false, // Types only = false
		searchFilter,
		attributes,
		nil,
	)

	sr, err := conn.Search(searchRequest)
	if err != nil {
		return nil, fmt.Errorf("failed to search Active Directory: %w", err)
	}

	// Resolve memberOf DNs to group names; membership is nil (unknown) if groups cannot be read
	dnToGroupName, groupsErr := p.getGroupDnMap(conn, baseDN)
	if groupsErr != nil {
		fmt.Printf("Warning: failed to fetch Active Directory groups: %v. Group membership will not be synced.\n", groupsErr)
	}

	originalUsers := []*OriginalUser{}
	for _, entry := range sr.Entries {
		originalUser := p.adEntryToOriginalUser(entry)
		if groupsErr != nil {
			originalUser.Groups = nil
		} else {
			originalUser.Groups = adGroupNamesForEntry(entry, dnToGroupName)
		}
		originalUsers = append(originalUsers, originalUser)
	}

	return originalUsers, nil
}

// adEntryToOriginalUser converts an Active Directory LDAP entry to Casdoor OriginalUser
func (p *ActiveDirectorySyncerProvider) adEntryToOriginalUser(entry *goldap.Entry) *OriginalUser {
	user := &OriginalUser{
		Address:    []string{},
		Properties: map[string]string{},
		Groups:     []string{},
	}

	// Get basic attributes with UTF-8 sanitization
	sAMAccountName := getAttributeValueSafe(entry, "sAMAccountName")
	userPrincipalName := getAttributeValueSafe(entry, "userPrincipalName")
	displayName := getAttributeValueSafe(entry, "displayName")
	givenName := getAttributeValueSafe(entry, "givenName")
	sn := getAttributeValueSafe(entry, "sn")
	mail := getAttributeValueSafe(entry, "mail")
	telephoneNumber := getAttributeValueSafe(entry, "telephoneNumber")
	mobile := getAttributeValueSafe(entry, "mobile")
	title := getAttributeValueSafe(entry, "title")
	department := getAttributeValueSafe(entry, "department")
	company := getAttributeValueSafe(entry, "company")
	streetAddress := getAttributeValueSafe(entry, "streetAddress")
	city := getAttributeValueSafe(entry, "l")
	state := getAttributeValueSafe(entry, "st")
	postalCode := getAttributeValueSafe(entry, "postalCode")
	country := getAttributeValueSafe(entry, "co")
	whenCreated := getAttributeValueSafe(entry, "whenCreated")
	userAccountControlStr := getAttributeValueSafe(entry, "userAccountControl")

	// Handle objectGUID specially - it's a binary attribute
	var objectGUID string
	objectGUIDBytes := entry.GetRawAttributeValue("objectGUID")
	if len(objectGUIDBytes) == 16 {
		objectGUID = convertGUIDToString(objectGUIDBytes)
	}

	// Set user fields
	// Use sAMAccountName as the primary username
	user.Name = sAMAccountName

	// Use objectGUID as the unique ID if available, otherwise use sAMAccountName
	if objectGUID != "" {
		user.Id = objectGUID
	} else {
		user.Id = sAMAccountName
	}

	user.DisplayName = displayName
	user.FirstName = givenName
	user.LastName = sn

	// If display name is empty, construct from first and last name
	if user.DisplayName == "" && (user.FirstName != "" || user.LastName != "") {
		user.DisplayName = strings.TrimSpace(fmt.Sprintf("%s %s", user.FirstName, user.LastName))
	}

	// Set email - prefer mail attribute, fallback to userPrincipalName
	if mail != "" {
		user.Email = mail
	} else if userPrincipalName != "" {
		user.Email = userPrincipalName
	}

	// Set phone - prefer mobile, fallback to telephoneNumber
	if mobile != "" {
		user.Phone = mobile
	} else if telephoneNumber != "" {
		user.Phone = telephoneNumber
	}

	user.Title = title

	// Set affiliation/department
	if department != "" {
		user.Affiliation = department
	}

	// Construct location from city, state, country
	locationParts := []string{}
	if city != "" {
		locationParts = append(locationParts, city)
	}
	if state != "" {
		locationParts = append(locationParts, state)
	}
	if country != "" {
		locationParts = append(locationParts, country)
	}
	if len(locationParts) > 0 {
		user.Location = strings.Join(locationParts, ", ")
	}

	// Construct address
	if streetAddress != "" {
		addressParts := []string{streetAddress}
		if city != "" {
			addressParts = append(addressParts, city)
		}
		if state != "" {
			addressParts = append(addressParts, state)
		}
		if postalCode != "" {
			addressParts = append(addressParts, postalCode)
		}
		if country != "" {
			addressParts = append(addressParts, country)
		}
		user.Address = []string{strings.Join(addressParts, ", ")}
	}

	// Store additional properties
	if company != "" {
		user.Properties["company"] = company
	}
	if userPrincipalName != "" {
		user.Properties["userPrincipalName"] = userPrincipalName
	}

	// Set creation time
	if whenCreated != "" {
		user.CreatedTime = whenCreated
	} else {
		user.CreatedTime = util.GetCurrentTime()
	}

	// Parse userAccountControl to determine if account is disabled
	// Bit 2 (value 2) indicates the account is disabled
	if userAccountControlStr != "" {
		userAccountControl := util.ParseInt(userAccountControlStr)
		// Check if bit 2 is set (account disabled)
		user.IsForbidden = (userAccountControl & 0x02) != 0
	}

	return user
}

// adGroupAttributes are the attributes read from group objects.
var adGroupAttributes = []string{"sAMAccountName", "cn", "description", "mail", "managedBy", "distinguishedName", "objectGUID"}

// searchGroups lists all group objects below baseDN using paged searches.
func (p *ActiveDirectorySyncerProvider) searchGroups(conn *goldap.Conn, baseDN string) ([]*goldap.Entry, error) {
	searchRequest := goldap.NewSearchRequest(
		baseDN,
		goldap.ScopeWholeSubtree,
		goldap.NeverDerefAliases,
		0,
		0,
		false,
		"(objectClass=group)",
		adGroupAttributes,
		nil,
	)

	sr, err := conn.SearchWithPaging(searchRequest, 500)
	if err != nil {
		return nil, fmt.Errorf("failed to search Active Directory groups: %w", err)
	}

	return sr.Entries, nil
}

// adGroupName returns the JetAuth group name for a group entry: sAMAccountName, falling back to cn.
func adGroupName(entry *goldap.Entry) string {
	name := getAttributeValueSafe(entry, "sAMAccountName")
	if name == "" {
		name = getAttributeValueSafe(entry, "cn")
	}
	return name
}

// adEntryToOriginalGroup converts an Active Directory group entry to an OriginalGroup.
func adEntryToOriginalGroup(entry *goldap.Entry) *OriginalGroup {
	name := adGroupName(entry)

	id := name
	if guidBytes := entry.GetRawAttributeValue("objectGUID"); len(guidBytes) == 16 {
		id = convertGUIDToString(guidBytes)
	}

	displayName := getAttributeValueSafe(entry, "cn")
	if displayName == "" {
		displayName = name
	}

	return &OriginalGroup{
		Id:          id,
		Name:        name,
		DisplayName: displayName,
		Description: getAttributeValueSafe(entry, "description"),
		Type:        "Virtual",
		Manager:     adCommonNameFromDn(getAttributeValueSafe(entry, "managedBy")),
		Email:       getAttributeValueSafe(entry, "mail"),
	}
}

// adCommonNameFromDn extracts the first RDN value of a distinguished name ("CN=Jane,OU=x" -> "Jane").
func adCommonNameFromDn(dn string) string {
	parsed, err := goldap.ParseDN(dn)
	if err != nil || len(parsed.RDNs) == 0 || len(parsed.RDNs[0].Attributes) == 0 {
		return ""
	}
	return parsed.RDNs[0].Attributes[0].Value
}

// getGroupDnMap returns lower-cased group DN -> group name.
func (p *ActiveDirectorySyncerProvider) getGroupDnMap(conn *goldap.Conn, baseDN string) (map[string]string, error) {
	entries, err := p.searchGroups(conn, baseDN)
	if err != nil {
		return nil, err
	}

	res := map[string]string{}
	for _, entry := range entries {
		name := adGroupName(entry)
		if name == "" {
			continue
		}
		res[strings.ToLower(entry.DN)] = name
	}

	return res, nil
}

// adGroupNamesForEntry resolves the memberOf values of a user entry to group names. DNs that are
// not known groups (e.g. outside the search base) are ignored.
func adGroupNamesForEntry(entry *goldap.Entry, dnToGroupName map[string]string) []string {
	names := []string{}
	seen := map[string]bool{}
	for _, dn := range entry.GetAttributeValues("memberOf") {
		name, ok := dnToGroupName[strings.ToLower(dn)]
		if ok && !seen[name] {
			seen[name] = true
			names = append(names, name)
		}
	}
	return names
}

// GetOriginalGroups retrieves all groups from Active Directory. The sAMAccountName is the group name.
func (p *ActiveDirectorySyncerProvider) GetOriginalGroups() ([]*OriginalGroup, error) {
	conn, err := p.getLdapConn()
	if err != nil {
		return nil, err
	}
	defer conn.Close()

	baseDN := p.Syncer.Database
	if baseDN == "" {
		return nil, fmt.Errorf("database field (base DN) is required for Active Directory syncer")
	}

	entries, err := p.searchGroups(conn, baseDN)
	if err != nil {
		return nil, err
	}

	originalGroups := []*OriginalGroup{}
	for _, entry := range entries {
		group := adEntryToOriginalGroup(entry)
		if group.Name == "" {
			continue
		}
		originalGroups = append(originalGroups, group)
	}

	return originalGroups, nil
}

// GetOriginalUserGroups retrieves the names of the groups a user (sAMAccountName or objectGUID) is a
// direct member of. Nested group membership and the primary group are not expanded.
func (p *ActiveDirectorySyncerProvider) GetOriginalUserGroups(userId string) ([]string, error) {
	conn, err := p.getLdapConn()
	if err != nil {
		return nil, err
	}
	defer conn.Close()

	baseDN := p.Syncer.Database
	if baseDN == "" {
		return nil, fmt.Errorf("database field (base DN) is required for Active Directory syncer")
	}

	// userId is either the objectGUID string or the sAMAccountName (see adEntryToOriginalUser)
	filter := fmt.Sprintf("(&(objectClass=user)(objectCategory=person)(sAMAccountName=%s))", goldap.EscapeFilter(userId))
	if guid := adGuidStringToLdapFilterBytes(userId); guid != "" {
		filter = fmt.Sprintf("(&(objectClass=user)(objectCategory=person)(objectGUID=%s))", guid)
	}

	sr, err := conn.Search(goldap.NewSearchRequest(baseDN, goldap.ScopeWholeSubtree, goldap.NeverDerefAliases, 1, 0, false, filter, []string{"memberOf"}, nil))
	if err != nil {
		return nil, fmt.Errorf("failed to search Active Directory user: %w", err)
	}
	if len(sr.Entries) == 0 {
		return []string{}, nil
	}

	dnToGroupName, err := p.getGroupDnMap(conn, baseDN)
	if err != nil {
		return nil, err
	}

	return adGroupNamesForEntry(sr.Entries[0], dnToGroupName), nil
}

// adGuidStringToLdapFilterBytes converts a UUID string produced by convertGUIDToString into the
// escaped binary form usable in an LDAP filter, or "" if s is not a GUID.
func adGuidStringToLdapFilterBytes(s string) string {
	hexStr := strings.ReplaceAll(s, "-", "")
	if len(hexStr) != 32 {
		return ""
	}
	raw, err := hex.DecodeString(hexStr)
	if err != nil {
		return ""
	}

	// Inverse of convertGUIDToString: the first three groups are stored little-endian
	b := []byte{raw[3], raw[2], raw[1], raw[0], raw[5], raw[4], raw[7], raw[6], raw[8], raw[9], raw[10], raw[11], raw[12], raw[13], raw[14], raw[15]}
	var sb strings.Builder
	for _, c := range b {
		sb.WriteString(fmt.Sprintf("\\%02x", c))
	}
	return sb.String()
}
