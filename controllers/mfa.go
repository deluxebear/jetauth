// Copyright 2023 The Casdoor Authors. All Rights Reserved.
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

package controllers

import (
	"net/http"

	"github.com/deluxebear/jetauth/object"
	"github.com/deluxebear/jetauth/util"
)

// MfaPropsResponse represents the response for MFA setup initiation
type MfaPropsResponse struct {
	Status string          `json:"status" example:"ok"`
	Msg    string          `json:"msg" example:""`
	Data   object.MfaProps `json:"data"`
}

// MfaPropsListResponse represents the response containing a list of MFA properties
type MfaPropsListResponse struct {
	Status string            `json:"status" example:"ok"`
	Msg    string            `json:"msg" example:""`
	Data   []object.MfaProps `json:"data"`
}

// MfaSetupInitiate
// @Summary MfaSetupInitiate
// @Tags MFA API
// @Description setup MFA
// @Param owner	formData	string	true	"owner of user"
// @Param name	formData	string	true	"name of user"
// @Param type	formData	string	true	"MFA auth type"
// @Success 200 {object} controllers.MfaPropsResponse "The Response object"
// @Router /mfa/setup/initiate [post]
func (c *ApiController) MfaSetupInitiate() {
	owner := c.Ctx.Request.Form.Get("owner")
	name := c.Ctx.Request.Form.Get("name")
	mfaType := c.Ctx.Request.Form.Get("mfaType")
	userId := util.GetId(owner, name)

	if len(userId) == 0 {
		c.ResponseError(http.StatusText(http.StatusBadRequest))
		return
	}

	MfaUtil := object.GetMfaUtil(mfaType, nil)
	if MfaUtil == nil {
		c.ResponseError(c.T("mfa:Invalid MFA type"))
	}

	user, err := object.GetUser(userId)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}

	if user == nil {
		c.ResponseError(c.T("mfa:User does not exist"))
		return
	}

	organization, err := object.GetOrganizationByUser(user)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}

	issuer := ""
	if organization != nil && organization.DisplayName != "" {
		issuer = organization.DisplayName
	} else if organization != nil {
		issuer = organization.Name
	}

	mfaProps, err := MfaUtil.Initiate(user.GetId(), issuer)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}

	recoveryCode := util.GenerateUUID()
	mfaProps.RecoveryCodes = []string{recoveryCode}
	mfaProps.MfaRememberInHours = organization.MfaRememberInHours

	resp := mfaProps
	c.ResponseOk(resp)
}

// MfaSetupVerify
// @Summary MfaSetupVerify
// @Tags MFA API
// @Description setup verify totp
// @Param	secret		formData	string	true	"MFA secret"
// @Param	passcode	formData 	string 	true	"MFA passcode"
// @Success 200 {object} controllers.ActionResponse "The Response object"
// @Router /mfa/setup/verify [post]
func (c *ApiController) MfaSetupVerify() {
	mfaType := c.Ctx.Request.Form.Get("mfaType")
	passcode := c.Ctx.Request.Form.Get("passcode")
	secret := c.Ctx.Request.Form.Get("secret")
	dest := c.Ctx.Request.Form.Get("dest")
	countryCode := c.Ctx.Request.Form.Get("countryCode")

	if mfaType == "" || passcode == "" {
		c.ResponseError(c.T("mfa:Missing MFA type or passcode"))
		return
	}

	config := &object.MfaProps{
		MfaType: mfaType,
	}
	if mfaType == object.TotpType {
		if secret == "" {
			c.ResponseError(c.T("mfa:TOTP secret is missing"))
			return
		}
		config.Secret = secret
	} else if mfaType == object.SmsType {
		if dest == "" {
			c.ResponseError(c.T("mfa:Destination is missing"))
			return
		}
		config.Secret = dest
		if countryCode == "" {
			c.ResponseError(c.T("mfa:Country code is missing"))
			return
		}
		config.CountryCode = countryCode
	} else if mfaType == object.EmailType {
		if dest == "" {
			c.ResponseError(c.T("mfa:Destination is missing"))
			return
		}
		config.Secret = dest
	} else if mfaType == object.RadiusType {
		if dest == "" {
			c.ResponseError(c.T("mfa:RADIUS username is missing"))
			return
		}
		config.Secret = dest
		if secret == "" {
			c.ResponseError(c.T("mfa:RADIUS provider is missing"))
			return
		}
		config.URL = secret
	} else if mfaType == object.PushType {
		if dest == "" {
			c.ResponseError(c.T("mfa:Push receiver is missing"))
			return
		}
		config.Secret = dest
		if secret == "" {
			c.ResponseError(c.T("mfa:Push provider is missing"))
			return
		}
		config.URL = secret
	}

	mfaUtil := object.GetMfaUtil(mfaType, config)
	if mfaUtil == nil {
		c.ResponseError(c.T("mfa:Invalid MFA type"))
		return
	}

	err := mfaUtil.SetupVerify(passcode)
	if err != nil {
		c.ResponseError(err.Error())
	} else {
		c.ResponseOk(http.StatusText(http.StatusOK))
	}
}

// MfaSetupEnable
// @Summary MfaSetupEnable
// @Tags MFA API
// @Description enable totp
// @Param owner	formData	string	true	"owner of user"
// @Param name	formData	string	true	"name of user"
// @Param type	formData	string	true	"MFA auth type"
// @Success 200 {object} controllers.ActionResponse "The Response object"
// @Router /mfa/setup/enable [post]
func (c *ApiController) MfaSetupEnable() {
	owner := c.Ctx.Request.Form.Get("owner")
	name := c.Ctx.Request.Form.Get("name")
	mfaType := c.Ctx.Request.Form.Get("mfaType")
	secret := c.Ctx.Request.Form.Get("secret")
	dest := c.Ctx.Request.Form.Get("dest")
	countryCode := c.Ctx.Request.Form.Get("secret")
	recoveryCodes := c.Ctx.Request.Form.Get("recoveryCodes")

	user, err := object.GetUser(util.GetId(owner, name))
	if err != nil {
		c.ResponseError(err.Error())
		return
	}

	if user == nil {
		c.ResponseError(c.T("mfa:User does not exist"))
		return
	}

	config := &object.MfaProps{
		MfaType: mfaType,
	}

	if mfaType == object.TotpType {
		if secret == "" {
			c.ResponseError(c.T("mfa:TOTP secret is missing"))
			return
		}
		config.Secret = secret
	} else if mfaType == object.EmailType {
		if user.Email == "" {
			if dest == "" {
				c.ResponseError(c.T("mfa:Destination is missing"))
				return
			}
			user.Email = dest
		}
	} else if mfaType == object.SmsType {
		if user.Phone == "" {
			if dest == "" {
				c.ResponseError(c.T("mfa:Destination is missing"))
				return
			}
			user.Phone = dest
			if countryCode == "" {
				c.ResponseError(c.T("mfa:Country code is missing"))
				return
			}
			user.CountryCode = countryCode
		}
	} else if mfaType == object.RadiusType {
		if dest == "" {
			c.ResponseError(c.T("mfa:RADIUS username is missing"))
			return
		}
		config.Secret = dest
		if secret == "" {
			c.ResponseError(c.T("mfa:RADIUS provider is missing"))
			return
		}
		config.URL = secret
	} else if mfaType == object.PushType {
		if dest == "" {
			c.ResponseError(c.T("mfa:Push receiver is missing"))
			return
		}
		config.Secret = dest
		if secret == "" {
			c.ResponseError(c.T("mfa:Push provider is missing"))
			return
		}
		config.URL = secret
	}

	if recoveryCodes == "" {
		c.ResponseError(c.T("mfa:Recovery codes are missing"))
		return
	}
	config.RecoveryCodes = []string{recoveryCodes}

	mfaUtil := object.GetMfaUtil(mfaType, config)
	if mfaUtil == nil {
		c.ResponseError(c.T("mfa:Invalid MFA type"))
		return
	}

	err = mfaUtil.Enable(user)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}

	c.ResponseOk(http.StatusText(http.StatusOK))
}

// DeleteMfa
// @Summary DeleteMfa
// @Tags MFA API
// @Description: Delete MFA
// @Param owner	formData	string	true	"owner of user"
// @Param name	formData	string	true	"name of user"
// @Success 200 {object} controllers.MfaPropsListResponse "The Response object"
// @Router /delete-mfa/ [post]
func (c *ApiController) DeleteMfa() {
	owner := c.Ctx.Request.Form.Get("owner")
	name := c.Ctx.Request.Form.Get("name")
	userId := util.GetId(owner, name)

	user, err := object.GetUser(userId)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}
	if user == nil {
		c.ResponseError(c.T("mfa:User does not exist"))
		return
	}

	err = object.DisabledMultiFactorAuth(user)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}

	c.ResponseOk(object.GetAllMfaProps(user, true))
}

// SetPreferredMfa
// @Summary SetPreferredMfa
// @Tags MFA API
// @Description: Set specific Mfa Preferred
// @Param owner	formData	string	true	"owner of user"
// @Param name	formData	string	true	"name of user"
// @Param id	formData	string	true	"id of user's MFA props"
// @Success 200 {object} controllers.MfaPropsListResponse "The Response object"
// @Router /set-preferred-mfa [post]
func (c *ApiController) SetPreferredMfa() {
	mfaType := c.Ctx.Request.Form.Get("mfaType")
	owner := c.Ctx.Request.Form.Get("owner")
	name := c.Ctx.Request.Form.Get("name")
	userId := util.GetId(owner, name)

	user, err := object.GetUser(userId)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}
	if user == nil {
		c.ResponseError(c.T("mfa:User does not exist"))
		return
	}

	err = object.SetPreferredMultiFactorAuth(user, mfaType)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}
	c.ResponseOk(object.GetAllMfaProps(user, true))
}
