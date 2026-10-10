// Copyright 2026 The Casdoor Authors. All Rights Reserved.
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
	"context"
	"fmt"
	"sync"
	"time"

	"github.com/aws/aws-sdk-go/aws"
	"github.com/aws/aws-sdk-go/aws/credentials"
	"github.com/aws/aws-sdk-go/aws/session"
	"github.com/aws/aws-sdk-go/service/iam"
	"github.com/deluxebear/jetauth/util"
)

// AwsIamSyncerProvider implements SyncerProvider for AWS IAM API-based syncers
type AwsIamSyncerProvider struct {
	Syncer    *Syncer
	iamClient *iam.IAM

	mu           sync.Mutex
	userNameById map[string]string
}

// awsIamEndpointOverride replaces the default IAM endpoint, for tests only.
var awsIamEndpointOverride string

// InitAdapter initializes the AWS IAM syncer
func (p *AwsIamSyncerProvider) InitAdapter() error {
	// syncer.Host should be the AWS region (e.g., "us-east-1")
	// syncer.User should be the AWS Access Key ID
	// syncer.Password should be the AWS Secret Access Key

	region := p.Syncer.Host
	if region == "" {
		return fmt.Errorf("AWS region (host field) is required for AWS IAM syncer")
	}

	accessKeyId := p.Syncer.User
	if accessKeyId == "" {
		return fmt.Errorf("AWS Access Key ID (user field) is required for AWS IAM syncer")
	}

	secretAccessKey := p.Syncer.Password
	if secretAccessKey == "" {
		return fmt.Errorf("AWS Secret Access Key (password field) is required for AWS IAM syncer")
	}

	// Create AWS session
	awsConfig := &aws.Config{
		Region:      aws.String(region),
		Credentials: credentials.NewStaticCredentials(accessKeyId, secretAccessKey, ""),
	}
	if awsIamEndpointOverride != "" {
		awsConfig.Endpoint = aws.String(awsIamEndpointOverride)
		awsConfig.DisableSSL = aws.Bool(true)
	}
	sess, err := session.NewSession(awsConfig)
	if err != nil {
		return fmt.Errorf("failed to create AWS session: %w", err)
	}

	// Create IAM client
	p.iamClient = iam.New(sess)

	return nil
}

// GetOriginalUsers retrieves all users from AWS IAM API
func (p *AwsIamSyncerProvider) GetOriginalUsers() ([]*OriginalUser, error) {
	if p.iamClient == nil {
		if err := p.InitAdapter(); err != nil {
			return nil, err
		}
	}

	return p.getAwsIamUsers()
}

// AddUser adds a new user to AWS IAM (not supported for read-only API)
func (p *AwsIamSyncerProvider) AddUser(user *OriginalUser) (bool, error) {
	// AWS IAM syncer is typically read-only
	return false, fmt.Errorf("adding users to AWS IAM is not supported")
}

// UpdateUser updates an existing user in AWS IAM (not supported for read-only API)
func (p *AwsIamSyncerProvider) UpdateUser(user *OriginalUser) (bool, error) {
	// AWS IAM syncer is typically read-only
	return false, fmt.Errorf("updating users in AWS IAM is not supported")
}

// TestConnection tests the AWS IAM API connection
func (p *AwsIamSyncerProvider) TestConnection() error {
	if p.iamClient == nil {
		if err := p.InitAdapter(); err != nil {
			return err
		}
	}

	// Try to list users with a limit of 1 to test the connection
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	input := &iam.ListUsersInput{
		MaxItems: aws.Int64(1),
	}

	_, err := p.iamClient.ListUsersWithContext(ctx, input)
	return err
}

// Close closes any open connections
func (p *AwsIamSyncerProvider) Close() error {
	// AWS IAM client doesn't require explicit cleanup
	p.iamClient = nil
	return nil
}

// getAwsIamUsers gets all users from AWS IAM API
func (p *AwsIamSyncerProvider) getAwsIamUsers() ([]*OriginalUser, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	allUsers := []*iam.User{}
	var marker *string

	// Paginate through all users
	for {
		input := &iam.ListUsersInput{
			Marker: marker,
		}

		result, err := p.iamClient.ListUsersWithContext(ctx, input)
		if err != nil {
			return nil, fmt.Errorf("failed to list IAM users: %w", err)
		}

		allUsers = append(allUsers, result.Users...)

		if result.IsTruncated == nil || !*result.IsTruncated {
			break
		}

		marker = result.Marker
	}

	// Cache UserId -> UserName for GetOriginalUserGroups
	p.mu.Lock()
	p.userNameById = map[string]string{}
	for _, u := range allUsers {
		if u.UserId != nil && u.UserName != nil {
			p.userNameById[*u.UserId] = *u.UserName
		}
	}
	p.mu.Unlock()

	// Group membership is nil (unknown) when the groups cannot be listed (e.g. missing iam:ListGroups)
	userGroupsMap, groupsErr := p.buildUserGroupsMap(ctx)
	if groupsErr != nil {
		fmt.Printf("Warning: failed to fetch IAM group memberships: %v. Group membership will not be synced.\n", groupsErr)
	}

	// Convert AWS IAM users to Casdoor OriginalUser
	originalUsers := []*OriginalUser{}
	for _, iamUser := range allUsers {
		originalUser, err := p.awsIamUserToOriginalUser(iamUser)
		if err != nil {
			// Log error but continue processing other users
			userName := "unknown"
			if iamUser.UserName != nil {
				userName = *iamUser.UserName
			}
			fmt.Printf("Warning: Failed to convert IAM user %s: %v\n", userName, err)
			continue
		}
		if groupsErr != nil {
			originalUser.Groups = nil
		} else if groups, ok := userGroupsMap[originalUser.Id]; ok {
			originalUser.Groups = groups
		}
		originalUsers = append(originalUsers, originalUser)
	}

	return originalUsers, nil
}

// awsIamUserToOriginalUser converts AWS IAM user to Casdoor OriginalUser
func (p *AwsIamSyncerProvider) awsIamUserToOriginalUser(iamUser *iam.User) (*OriginalUser, error) {
	if iamUser == nil {
		return nil, fmt.Errorf("IAM user is nil")
	}

	user := &OriginalUser{
		Address:    []string{},
		Properties: map[string]string{},
		Groups:     []string{},
	}

	// Set ID from UserId (unique identifier)
	if iamUser.UserId != nil {
		user.Id = *iamUser.UserId
	}

	// Set Name from UserName
	if iamUser.UserName != nil {
		user.Name = *iamUser.UserName
	}

	// Set DisplayName (use UserName if not available separately)
	if iamUser.UserName != nil {
		user.DisplayName = *iamUser.UserName
	}

	// Set CreatedTime from CreateDate
	if iamUser.CreateDate != nil {
		user.CreatedTime = iamUser.CreateDate.Format(time.RFC3339)
	} else {
		user.CreatedTime = util.GetCurrentTime()
	}

	// Get user tags which might contain additional information
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	tagsInput := &iam.ListUserTagsInput{
		UserName: iamUser.UserName,
	}

	tagsResult, err := p.iamClient.ListUserTagsWithContext(ctx, tagsInput)
	if err == nil && tagsResult != nil {
		// Process tags to extract additional user information
		for _, tag := range tagsResult.Tags {
			if tag.Key != nil && tag.Value != nil {
				key := *tag.Key
				value := *tag.Value

				switch key {
				case "Email", "email":
					user.Email = value
				case "Phone", "phone":
					user.Phone = value
				case "DisplayName", "displayName":
					user.DisplayName = value
				case "FirstName", "firstName":
					user.FirstName = value
				case "LastName", "lastName":
					user.LastName = value
				case "Title", "title":
					user.Title = value
				case "Department", "department":
					user.Affiliation = value
				default:
					// Store other tags in Properties
					user.Properties[key] = value
				}
			}
		}
	}

	// AWS IAM users are active by default unless specified in tags
	// Check if there's a "Status" or "Active" tag
	if status, ok := user.Properties["Status"]; ok {
		if status == "Inactive" || status == "Disabled" {
			user.IsForbidden = true
		}
	}
	if active, ok := user.Properties["Active"]; ok {
		if active == "false" || active == "False" || active == "0" {
			user.IsForbidden = true
		}
	}

	return user, nil
}

// listIamGroups lists every IAM group, following pagination markers.
func (p *AwsIamSyncerProvider) listIamGroups(ctx context.Context) ([]*iam.Group, error) {
	allGroups := []*iam.Group{}
	var marker *string

	for {
		result, err := p.iamClient.ListGroupsWithContext(ctx, &iam.ListGroupsInput{Marker: marker})
		if err != nil {
			return nil, fmt.Errorf("failed to list IAM groups: %w", err)
		}

		allGroups = append(allGroups, result.Groups...)

		if result.IsTruncated == nil || !*result.IsTruncated {
			break
		}
		marker = result.Marker
	}

	return allGroups, nil
}

// GetOriginalGroups retrieves all groups from AWS IAM
func (p *AwsIamSyncerProvider) GetOriginalGroups() ([]*OriginalGroup, error) {
	if p.iamClient == nil {
		if err := p.InitAdapter(); err != nil {
			return nil, err
		}
	}

	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	allGroups, err := p.listIamGroups(ctx)
	if err != nil {
		return nil, err
	}

	// Convert AWS IAM groups to Casdoor OriginalGroup
	originalGroups := []*OriginalGroup{}
	for _, iamGroup := range allGroups {
		if iamGroup.GroupId != nil && iamGroup.GroupName != nil {
			group := &OriginalGroup{
				Id:   *iamGroup.GroupId,
				Name: *iamGroup.GroupName,
				Type: "Virtual",
			}

			if iamGroup.GroupName != nil {
				group.DisplayName = *iamGroup.GroupName
			}

			originalGroups = append(originalGroups, group)
		}
	}

	return originalGroups, nil
}

// resolveUserName maps an IAM UserId (the id used as OriginalUser.Id) to the UserName that the
// IAM group APIs require. The mapping is cached and refreshed from ListUsers on a miss. If the id
// is unknown it is assumed to already be a UserName.
func (p *AwsIamSyncerProvider) resolveUserName(ctx context.Context, userId string) (string, error) {
	p.mu.Lock()
	defer p.mu.Unlock()

	if name, ok := p.userNameById[userId]; ok {
		return name, nil
	}

	p.userNameById = map[string]string{}
	var marker *string
	for {
		result, err := p.iamClient.ListUsersWithContext(ctx, &iam.ListUsersInput{Marker: marker})
		if err != nil {
			return "", fmt.Errorf("failed to list IAM users: %w", err)
		}

		for _, u := range result.Users {
			if u.UserId != nil && u.UserName != nil {
				p.userNameById[*u.UserId] = *u.UserName
			}
		}

		if result.IsTruncated == nil || !*result.IsTruncated {
			break
		}
		marker = result.Marker
	}

	if name, ok := p.userNameById[userId]; ok {
		return name, nil
	}
	return userId, nil
}

// buildUserGroupsMap builds IAM UserId -> group names using one paginated GetGroup call per group.
func (p *AwsIamSyncerProvider) buildUserGroupsMap(ctx context.Context) (map[string][]string, error) {
	groups, err := p.listIamGroups(ctx)
	if err != nil {
		return nil, err
	}

	res := map[string][]string{}
	for _, group := range groups {
		if group.GroupName == nil {
			continue
		}

		var marker *string
		for {
			result, err := p.iamClient.GetGroupWithContext(ctx, &iam.GetGroupInput{GroupName: group.GroupName, Marker: marker})
			if err != nil {
				return nil, fmt.Errorf("failed to get IAM group %s: %w", *group.GroupName, err)
			}

			for _, u := range result.Users {
				if u.UserId != nil {
					addUserToGroupMap(res, *u.UserId, *group.GroupName)
				}
			}

			if result.IsTruncated == nil || !*result.IsTruncated {
				break
			}
			marker = result.Marker
		}
	}

	return res, nil
}

// GetOriginalUserGroups retrieves the names of the IAM groups a user belongs to. userId is the IAM
// UserId; it is translated to the UserName required by the ListGroupsForUser API.
func (p *AwsIamSyncerProvider) GetOriginalUserGroups(userId string) ([]string, error) {
	if p.iamClient == nil {
		if err := p.InitAdapter(); err != nil {
			return nil, err
		}
	}

	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	userName, err := p.resolveUserName(ctx, userId)
	if err != nil {
		return nil, err
	}

	groupNames := []string{}
	var marker *string
	for {
		result, err := p.iamClient.ListGroupsForUserWithContext(ctx, &iam.ListGroupsForUserInput{UserName: aws.String(userName), Marker: marker})
		if err != nil {
			return nil, fmt.Errorf("failed to list groups for IAM user %s: %w", userName, err)
		}

		for _, g := range result.Groups {
			if g.GroupName != nil {
				groupNames = append(groupNames, *g.GroupName)
			}
		}

		if result.IsTruncated == nil || !*result.IsTruncated {
			break
		}
		marker = result.Marker
	}

	return groupNames, nil
}
