// Copyright 2021 The Casdoor Authors. All Rights Reserved.
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
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"mime"
	"path"
	"path/filepath"
	"strings"

	"github.com/beego/beego/v2/core/utils/pagination"
	"github.com/deluxebear/jetauth/object"
	"github.com/deluxebear/jetauth/util"
)

// ResourceListResponse represents the response for resource list APIs
type ResourceListResponse struct {
	Status string            `json:"status" example:"ok"`
	Msg    string            `json:"msg" example:""`
	Data   []object.Resource `json:"data"`
	Data2  int               `json:"data2" example:"10"`
}

// ResourceResponse represents the response for single resource APIs
type ResourceResponse struct {
	Status string          `json:"status" example:"ok"`
	Msg    string          `json:"msg" example:""`
	Data   object.Resource `json:"data"`
}

// GetResources
// @Tags Resource API
// @Summary GetResources
// @Description get resources
// @Param		owner 		query 		string 				true 		"		0"
// @Param		user 		query 		string 				true 		"		0"
// @Param 		pageSize 	query 		integer 			false 				"Page Size"
// @Param 		p 			query 		integer 				false 				"Page Number"
// @Param 		field 		query 		string 				false 			" 		0"
// @Param 		value 		query 		string 				false 			" 		0"
// @Param 		sortField 	query 		string 				false 				"Sort Field"
// @Param 		sortOrder 	query 		string 				false 				"Sort Order"
// @Success		200 		{array} 	object.Resource 	"The Response object"
// @Router /get-resources [get]
func (c *ApiController) GetResources() {
	owner := c.Ctx.Input.Query("owner")
	user := c.Ctx.Input.Query("user")
	limit := c.Ctx.Input.Query("pageSize")
	page := c.Ctx.Input.Query("p")
	field := c.Ctx.Input.Query("field")
	value := c.Ctx.Input.Query("value")
	sortField := c.Ctx.Input.Query("sortField")
	sortOrder := c.Ctx.Input.Query("sortOrder")

	// RequireAdmin returns ("", true) for global admins (built-in org) and
	// (user.Owner, true) for org admins. We lock non-global admins to their
	// own org regardless of the owner query param — otherwise an org admin
	// could call the API directly with owner="" and list every org's files.
	adminOrg, ok := c.RequireAdmin()
	if !ok {
		return
	}
	if adminOrg != "" {
		owner = adminOrg
		user = ""
	}

	if sortField == "Direct" {
		provider, err := c.GetProviderFromContext("Storage")
		if err != nil {
			c.ResponseError(err.Error())
			return
		}

		prefix := sortOrder
		resources, err := object.GetDirectResources(owner, user, provider, prefix, c.GetAcceptLanguage())
		if err != nil {
			c.ResponseError(err.Error())
			return
		}

		c.ResponseOk(resources)
	} else if limit == "" || page == "" {
		resources, err := object.GetResources(owner, user)
		if err != nil {
			c.ResponseError(err.Error())
			return
		}

		c.ResponseOk(resources)
	} else {
		limit := util.ParseInt(limit)
		count, err := object.GetResourceCount(owner, user, field, value)
		if err != nil {
			c.ResponseError(err.Error())
			return
		}

		paginator := pagination.NewPaginator(c.Ctx.Request, limit, count)
		resources, err := object.GetPaginationResources(owner, user, paginator.Offset(), limit, field, value, sortField, sortOrder)
		if err != nil {
			c.ResponseError(err.Error())
			return
		}

		c.ResponseOk(resources, paginator.Nums())
	}
}

// GetResource
// @Tags Resource API
// @Summary GetResource
// @Description get resource
// @Param   	id			query   	string     			true        		"The id ( owner/name ) of resource"
// @Success 	200			{object}	object.Resource		"The Response object"
// @Router /get-resource [get]
func (c *ApiController) GetResource() {
	id := c.Ctx.Input.Query("id")

	resource, err := object.GetResource(id)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}

	c.ResponseOk(resource)
}

// UpdateResource
// @Tags Resource API
// @Summary UpdateResource
// @Description get resource
// @Param   	id     		query   	string  			true				"The id ( owner/name ) of resource"
// @Param		resource	body		object.Resource		true				"The resource object"
// @Success 200 {object} ActionResponse "Action result"
// @Router /update-resource [post]
func (c *ApiController) UpdateResource() {
	id := c.Ctx.Input.Query("id")

	var resource object.Resource
	err := json.Unmarshal(c.Ctx.Input.RequestBody, &resource)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}

	c.enforceOwnerFromId(id, func(owner string) { resource.Owner = owner })

	c.Data["json"] = wrapActionResponse(object.UpdateResource(id, &resource))
	c.ServeJSON()
}

// AddResource
// @Tags Resource API
// @Summary AddResource
// @Param     	resource    body    	object.Resource  	true      			"Resource object"
// @Success 200 {object} ActionResponse "Action result"
// @Router /add-resource [post]
func (c *ApiController) AddResource() {
	adminOrg, ok := c.RequireAdmin()
	if !ok {
		return
	}

	var resource object.Resource
	err := json.Unmarshal(c.Ctx.Input.RequestBody, &resource)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}

	// Org admins can only add to their own org — ignore whatever the client
	// put in the body. Global admins pass adminOrg == "" and can add anywhere.
	if adminOrg != "" {
		resource.Owner = adminOrg
	}

	c.Data["json"] = wrapActionResponse(object.AddResource(&resource))
	c.ServeJSON()
}

// DeleteResource
// @Tags Resource API
// @Summary DeleteResource
// @Param     	resource    body    	object.Resource  	true      			"Resource object"
// @Success 200 {object} ActionResponse "Action result"
// @Router /delete-resource [post]
func (c *ApiController) DeleteResource() {
	adminOrg, ok := c.RequireAdmin()
	if !ok {
		return
	}

	var resource object.Resource
	err := json.Unmarshal(c.Ctx.Input.RequestBody, &resource)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}

	// Org admins can only delete resources they own. Refuse rather than
	// silently overwrite — the body carries the file name + provider, and
	// we'd otherwise delete the wrong row (or the wrong file on disk).
	if adminOrg != "" && resource.Owner != adminOrg {
		c.ResponseError(c.T("general:this operation requires administrator to perform"))
		return
	}

	if resource.Provider != "" {
		inputs, _ := c.Input()
		inputs.Set("provider", resource.Provider)
	}
	inputs, _ := c.Input()
	inputs.Set("fullFilePath", resource.Name)
	provider, err := c.GetProviderFromContext("Storage")
	if err != nil {
		c.ResponseError(err.Error())
		return
	}
	_, resource.Name = refineFullFilePath(resource.Name)

	tag := c.Ctx.Input.Query("tag")
	if tag == "Direct" {
		resource.Name = path.Join(provider.PathPrefix, resource.Name)
	}

	err = object.DeleteFile(provider, resource.Name, c.GetAcceptLanguage())
	if err != nil {
		c.ResponseError(err.Error())
		return
	}

	c.Data["json"] = wrapActionResponse(object.DeleteResource(&resource))
	c.ServeJSON()
}

// UploadResource
// @Tags Resource API
// @Summary UploadResource
// @Param     owner           query   	string    			true      		"     0"
// @Param     user            query   	string    			true      		"     0"
// @Param     application     query   	string    			true     		"     0"
// @Param     tag             query   	string    			false     		"     0"
// @Param     parent          query   	string    			false     		"     0"
// @Param     fullFilePath    query   	string    			true     			"Full File Path"
// @Param     createdTime     query   	string    			false     			"Created Time"
// @Param     description     query   	string    			false     		"     0"
// @Param     file            formData 	file      			true      			"Resource file"
// @Success   200             {object}  object.Resource  	"FileUrl, objectKey"
// @Router /upload-resource [post]
func (c *ApiController) UploadResource() {
	adminOrg, ok := c.RequireAdmin()
	if !ok {
		return
	}

	owner := c.Ctx.Input.Query("owner")
	username := c.Ctx.Input.Query("user")
	application := c.Ctx.Input.Query("application")
	tag := c.Ctx.Input.Query("tag")
	parent := c.Ctx.Input.Query("parent")
	fullFilePath := c.Ctx.Input.Query("fullFilePath")
	createdTime := c.Ctx.Input.Query("createdTime")
	description := c.Ctx.Input.Query("description")

	// Org admins can only upload into their own org. Force the owner so a
	// crafted ?owner=otherOrg request can't plant a file in another tenant.
	if adminOrg != "" {
		owner = adminOrg
	}

	file, header, err := c.GetFile("file")
	if err != nil {
		c.ResponseError(err.Error())
		return
	}
	defer file.Close()

	if username == "" || fullFilePath == "" {
		c.ResponseError(fmt.Sprintf(c.T("resource:Username or fullFilePath is empty: username = %s, fullFilePath = %s"), username, fullFilePath))
		return
	}

	filename := filepath.Base(fullFilePath)
	fileBuffer := bytes.NewBuffer(nil)
	if _, err = io.Copy(fileBuffer, file); err != nil {
		c.ResponseError(err.Error())
		return
	}

	provider, err := c.GetProviderFromContext("Storage")
	if err != nil {
		c.ResponseError(err.Error())
		return
	}
	_, fullFilePath = refineFullFilePath(fullFilePath)

	fileType := "unknown"
	contentType := header.Header.Get("Content-Type")
	fileType, _ = util.GetOwnerAndNameFromIdNoCheck(contentType + "/")

	if fileType != "image" && fileType != "video" {
		ext := filepath.Ext(filename)
		mimeType := mime.TypeByExtension(ext)
		fileType, _ = util.GetOwnerAndNameFromIdNoCheck(mimeType + "/")
	}

	fullFilePath = object.GetTruncatedPath(provider, fullFilePath, 450)
	if tag != "avatar" && tag != "termsOfUse" && !strings.HasPrefix(tag, "idCard") {
		ext := filepath.Ext(filepath.Base(fullFilePath))
		index := len(fullFilePath) - len(ext)
		for i := 1; ; i++ {
			_, objectKey := object.GetUploadFileUrl(provider, fullFilePath, true)
			if count, err := object.GetResourceCount(owner, username, "name", objectKey); err != nil {
				c.ResponseError(err.Error())
				return
			} else if count == 0 {
				break
			}

			// duplicated fullFilePath found, change it
			fullFilePath = fullFilePath[:index] + fmt.Sprintf("-%d", i) + ext
		}
	}

	fileUrl, objectKey, err := object.UploadFileSafe(provider, fullFilePath, fileBuffer, c.GetAcceptLanguage())
	if err != nil {
		c.ResponseError(err.Error())
		return
	}

	if username == "Built-in-Untracked" {
		c.ResponseOk(fileUrl, objectKey)
		return
	}

	if createdTime == "" {
		createdTime = util.GetCurrentTime()
	}
	fileFormat := filepath.Ext(fullFilePath)
	fileSize := int(header.Size)
	resource := &object.Resource{
		Owner:       owner,
		Name:        objectKey,
		CreatedTime: createdTime,
		User:        username,
		Provider:    provider.Name,
		Application: application,
		Tag:         tag,
		Parent:      parent,
		FileName:    filename,
		FileType:    fileType,
		FileFormat:  fileFormat,
		FileSize:    fileSize,
		Url:         fileUrl,
		Description: description,
	}
	_, err = object.AddOrUpdateResource(resource)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}

	switch tag {
	case "avatar":
		user, err := object.GetUserNoCheck(util.GetId(owner, username))
		if err != nil {
			c.ResponseError(err.Error())
			return
		}

		if user == nil {
			c.ResponseError(c.T("resource:User is nil for tag: avatar"))
			return
		}

		user.Avatar = fileUrl
		_, err = object.UpdateUser(user.GetId(), user, []string{"avatar"}, false)
		if err != nil {
			c.ResponseError(err.Error())
			return
		}

	case "termsOfUse":
		user, err := object.GetUserNoCheck(util.GetId(owner, username))
		if err != nil {
			c.ResponseError(err.Error())
			return
		}

		if user == nil {
			c.ResponseError(fmt.Sprintf(c.T("general:The user: %s doesn't exist"), util.GetId(owner, username)))
			return
		}

		if !user.IsAdminUser() {
			c.ResponseError(c.T("auth:Unauthorized operation"))
			return
		}

		_, applicationId := util.GetOwnerAndNameFromIdNoCheck(strings.TrimSuffix(fullFilePath, ".html"))
		applicationObj, err := object.GetApplication(applicationId)
		if err != nil {
			c.ResponseError(err.Error())
			return
		}

		applicationObj.TermsOfUse = fileUrl
		_, err = object.UpdateApplication(applicationId, applicationObj, true, c.GetAcceptLanguage())
		if err != nil {
			c.ResponseError(err.Error())
			return
		}
	case "idCardFront", "idCardBack", "idCardWithPerson":
		user, err := object.GetUserNoCheck(util.GetId(owner, username))
		if err != nil {
			c.ResponseError(err.Error())
			return
		}

		if user == nil {
			c.ResponseError(c.T("resource:User is nil for tag: avatar"))
			return
		}

		if user.Properties == nil {
			user.Properties = map[string]string{}
		}
		user.Properties[tag] = fileUrl
		user.Properties["isIdCardVerified"] = "false"
		_, err = object.UpdateUser(user.GetId(), user, []string{"properties"}, false)
		if err != nil {
			c.ResponseError(err.Error())
			return
		}
	}

	c.ResponseOk(fileUrl, objectKey)
}
