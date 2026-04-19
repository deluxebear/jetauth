// Copyright 2026 The JetAuth Authors. All rights reserved.

package controllers

import (
	"fmt"

	"github.com/deluxebear/jetauth/idp"
	"github.com/deluxebear/jetauth/object"
)

// BeginQRSignin
// @Tags System API
// @Summary Begin a QR sign-in flow
// @Description Generates a QR code image + ticket for the given provider.
// Currently only WeChat-type providers are implemented; other types
// return an explanatory error. The generalised frontend can keep the
// same call site and migrate providers one by one.
// @Router /qr/begin [get]
// @Param   provider    query    string  true        "The id (owner/name) of the QR-capable provider"
// @Success 200 {object} Response "Data=imageUrl, Data2=ticket, Data3=expiresInSec"
func (c *ApiController) BeginQRSignin() {
	providerId := c.Ctx.Input.Query("provider")
	if providerId == "" {
		c.ResponseError("missing 'provider' query parameter")
		return
	}

	provider, err := object.GetProvider(providerId)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}
	if provider == nil {
		c.ResponseError(fmt.Sprintf(c.T("auth:The provider: %s does not exist"), providerId))
		return
	}

	switch provider.Type {
	case "WeChat":
		imageUrl, ticket, err := idp.GetWechatOfficialAccountQRCode(
			provider.ClientId2,
			provider.ClientSecret2,
			providerId,
		)
		if err != nil {
			c.ResponseError(err.Error())
			return
		}
		// WeChat Official Account tickets live 5 minutes by default. Clients
		// use this to decide when to regenerate; if the QR expires the user
		// would just see a stale scan → nothing happens, so a conservative
		// value is fine here.
		const expiresInSec = 300
		c.Data["json"] = &Response{
			Status: "ok",
			Data:   imageUrl,
			Data2:  ticket,
			Data3:  expiresInSec,
		}
		c.ServeJSON()

	case "DingTalk", "Lark":
		c.ResponseError(fmt.Sprintf(
			"QR sign-in for %s is not yet implemented — only WeChat is currently supported. See docs/2026-04-19-qr-signin-proposal.md for the integration plan.",
			provider.Type,
		))

	case "Custom":
		c.ResponseError("custom QR sign-in requires a server-side webhook handler; not yet generalised")

	default:
		c.ResponseError(fmt.Sprintf("provider type %q does not support QR sign-in", provider.Type))
	}
}

// GetQRSigninStatus
// @Tags System API
// @Summary Poll a QR ticket's status
// @Description Returns pending/scanned/expired for a ticket previously
// issued by /qr/begin. Clients poll every ~2s until the status flips.
// Unknown tickets return "pending" (not an error) so the poll loop
// stays clean during the window where the ticket exists on the issuing
// side but hasn't reached the cache yet.
// @Router /qr/status [get]
// @Param   ticket      query    string  true        "The ticket from /qr/begin"
// @Success 200 {object} Response "Data = pending | scanned | expired"
func (c *ApiController) GetQRSigninStatus() {
	ticket := c.Ctx.Input.Query("ticket")
	if ticket == "" {
		c.ResponseError("missing 'ticket' query parameter")
		return
	}

	idp.Lock.RLock()
	val, ok := idp.WechatCacheMap[ticket]
	idp.Lock.RUnlock()

	status := "pending"
	if ok && val.IsScanned {
		status = "scanned"
	}
	c.Data["json"] = &Response{Status: "ok", Data: status}
	c.ServeJSON()
}
