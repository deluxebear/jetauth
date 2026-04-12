// Copyright 2024 The Casdoor Authors. All Rights Reserved.
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

// DefaultOrgAdminEditableFields defines the minimum set of fields
// that org admins can edit by default (when OrgAdminEditableFields is empty).
var DefaultOrgAdminEditableFields = []string{
	"displayName",
	"logo",
	"logoDark",
	"favicon",
	"websiteUrl",
	"defaultAvatar",
	"themeData",
}

// EnforceOrgAdminFields restores protected fields from the old organization
// record when the caller is not a global admin. Only fields listed in
// the organization's OrgAdminEditableFields (or the default set) are
// allowed to be modified.
func EnforceOrgAdminFields(org *Organization, oldOrg *Organization) {
	// nil = not configured → use defaults; [] = explicitly empty → nothing editable
	allowed := oldOrg.OrgAdminEditableFields
	if allowed == nil {
		allowed = DefaultOrgAdminEditableFields
	}

	allowedSet := make(map[string]bool, len(allowed))
	for _, f := range allowed {
		allowedSet[f] = true
	}

	// Name can never be changed by org admins
	org.Name = oldOrg.Name
	// OrgAdminEditableFields itself can never be changed by org admins
	org.OrgAdminEditableFields = oldOrg.OrgAdminEditableFields

	if !allowedSet["displayName"] {
		org.DisplayName = oldOrg.DisplayName
	}
	if !allowedSet["logo"] {
		org.Logo = oldOrg.Logo
	}
	if !allowedSet["logoDark"] {
		org.LogoDark = oldOrg.LogoDark
	}
	if !allowedSet["favicon"] {
		org.Favicon = oldOrg.Favicon
	}
	if !allowedSet["websiteUrl"] {
		org.WebsiteUrl = oldOrg.WebsiteUrl
	}
	if !allowedSet["defaultAvatar"] {
		org.DefaultAvatar = oldOrg.DefaultAvatar
	}
	if !allowedSet["defaultApplication"] {
		org.DefaultApplication = oldOrg.DefaultApplication
	}
	if !allowedSet["initScore"] {
		org.InitScore = oldOrg.InitScore
	}
	if !allowedSet["userTypes"] {
		org.UserTypes = oldOrg.UserTypes
	}
	if !allowedSet["tags"] {
		org.Tags = oldOrg.Tags
	}
	if !allowedSet["countryCodes"] {
		org.CountryCodes = oldOrg.CountryCodes
	}
	if !allowedSet["enableSoftDeletion"] {
		org.EnableSoftDeletion = oldOrg.EnableSoftDeletion
	}
	if !allowedSet["isProfilePublic"] {
		org.IsProfilePublic = oldOrg.IsProfilePublic
	}
	if !allowedSet["accountItems"] {
		org.AccountItems = oldOrg.AccountItems
	}
	if !allowedSet["passwordType"] {
		org.PasswordType = oldOrg.PasswordType
	}
	if !allowedSet["passwordSalt"] {
		org.PasswordSalt = oldOrg.PasswordSalt
	}
	if !allowedSet["passwordOptions"] {
		org.PasswordOptions = oldOrg.PasswordOptions
	}
	if !allowedSet["passwordObfuscatorType"] {
		org.PasswordObfuscatorType = oldOrg.PasswordObfuscatorType
	}
	if !allowedSet["passwordObfuscatorKey"] {
		org.PasswordObfuscatorKey = oldOrg.PasswordObfuscatorKey
	}
	if !allowedSet["passwordExpireDays"] {
		org.PasswordExpireDays = oldOrg.PasswordExpireDays
	}
	if !allowedSet["defaultPassword"] {
		org.DefaultPassword = oldOrg.DefaultPassword
	}
	if !allowedSet["mfaItems"] {
		org.MfaItems = oldOrg.MfaItems
	}
	if !allowedSet["mfaRememberDuration"] {
		org.MfaRememberInHours = oldOrg.MfaRememberInHours
	}
	if !allowedSet["navItems"] {
		org.NavItems = oldOrg.NavItems
	}
	if !allowedSet["userNavItems"] {
		org.UserNavItems = oldOrg.UserNavItems
	}
	if !allowedSet["widgetItems"] {
		org.WidgetItems = oldOrg.WidgetItems
	}
	if !allowedSet["balanceCurrency"] {
		org.BalanceCurrency = oldOrg.BalanceCurrency
	}
	if !allowedSet["themeData"] {
		org.ThemeData = oldOrg.ThemeData
	}
	if !allowedSet["masterPassword"] {
		org.MasterPassword = oldOrg.MasterPassword
	}
	if !allowedSet["masterVerificationCode"] {
		org.MasterVerificationCode = oldOrg.MasterVerificationCode
	}
	if !allowedSet["ipWhitelist"] {
		org.IpWhitelist = oldOrg.IpWhitelist
	}
	if !allowedSet["languages"] {
		org.Languages = oldOrg.Languages
	}
	if !allowedSet["useEmailAsUsername"] {
		org.UseEmailAsUsername = oldOrg.UseEmailAsUsername
	}
	if !allowedSet["enableTour"] {
		org.EnableTour = oldOrg.EnableTour
	}
	if !allowedSet["disableSignin"] {
		org.DisableSignin = oldOrg.DisableSignin
	}
	if !allowedSet["usePermanentAvatar"] {
		org.UsePermanentAvatar = oldOrg.UsePermanentAvatar
	}
}
