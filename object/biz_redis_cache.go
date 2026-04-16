// Copyright 2026 The JetAuth Authors. All Rights Reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0

package object

import (
	"context"
	"encoding/json"
	"fmt"
	"sync"
	"time"

	"github.com/beego/beego/v2/core/logs"
	"github.com/deluxebear/casdoor/conf"
	"github.com/redis/go-redis/v9"
)

var (
	bizRedisClient      *redis.Client
	bizRedisOnce        sync.Once
	bizCacheEnabled     bool
	bizCacheEnabledOnce sync.Once
)

const (
	bizPolicyCachePrefix = "jetauth:biz:policies:"
	bizPolicyCacheTTL    = 30 * time.Minute
)

// BizPolicyCacheData is the data stored in Redis for each app's policies.
type BizPolicyCacheData struct {
	ModelText        string     `json:"modelText"`
	Policies         [][]string `json:"policies"`
	GroupingPolicies [][]string `json:"groupingPolicies"`
	PolicyTable      string     `json:"policyTable"`
	UpdatedTime      string     `json:"updatedTime"`
}

// isBizPolicyCacheEnabled checks both redisEndpoint and bizPolicyCacheEnabled.
// Result is cached after first call since config doesn't change at runtime.
func isBizPolicyCacheEnabled() bool {
	bizCacheEnabledOnce.Do(func() {
		bizCacheEnabled = conf.GetConfigString("redisEndpoint") != "" &&
			conf.GetConfigBool("bizPolicyCacheEnabled")
	})
	return bizCacheEnabled
}

// getRedisClientIfEnabled returns the Redis client or nil if cache is disabled/unavailable.
func getRedisClientIfEnabled() *redis.Client {
	if !isBizPolicyCacheEnabled() {
		return nil
	}
	bizRedisOnce.Do(func() {
		endpoint := conf.GetConfigString("redisEndpoint")
		if endpoint == "" {
			return
		}
		bizRedisClient = redis.NewClient(&redis.Options{
			Addr: endpoint,
		})
		ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		defer cancel()
		if err := bizRedisClient.Ping(ctx).Err(); err != nil {
			logs.Warning("biz policy cache: Redis connection failed: %v", err)
			bizRedisClient = nil
		} else {
			logs.Info("biz policy cache: Redis connected at %s", endpoint)
		}
	})
	return bizRedisClient
}

// bizPolicyCacheGet tries to read cached policy data from Redis.
// Returns nil if cache miss, disabled, or error.
func bizPolicyCacheGet(owner, appName string) *BizPolicyCacheData {
	client := getRedisClientIfEnabled()
	if client == nil {
		return nil
	}

	key := fmt.Sprintf("%s%s/%s", bizPolicyCachePrefix, owner, appName)
	ctx := context.Background()
	val, err := client.Get(ctx, key).Result()
	if err == redis.Nil {
		return nil
	}
	if err != nil {
		logs.Warning("biz policy cache: get failed for %s/%s: %v", owner, appName, err)
		return nil
	}

	var data BizPolicyCacheData
	if err := json.Unmarshal([]byte(val), &data); err != nil {
		logs.Warning("biz policy cache: unmarshal failed for %s/%s: %v", owner, appName, err)
		return nil
	}
	return &data
}

// bizPolicyCacheSet writes policy data to Redis.
func bizPolicyCacheSet(owner, appName string, data *BizPolicyCacheData) {
	client := getRedisClientIfEnabled()
	if client == nil {
		return
	}

	bytes, err := json.Marshal(data)
	if err != nil {
		logs.Warning("biz policy cache: marshal failed for %s/%s: %v", owner, appName, err)
		return
	}

	key := fmt.Sprintf("%s%s/%s", bizPolicyCachePrefix, owner, appName)
	ctx := context.Background()
	if err := client.Set(ctx, key, string(bytes), bizPolicyCacheTTL).Err(); err != nil {
		logs.Warning("biz policy cache: set failed for %s/%s: %v", owner, appName, err)
	}
}

// bizPolicyCacheClear removes cached policy data from Redis.
func bizPolicyCacheClear(owner, appName string) {
	client := getRedisClientIfEnabled()
	if client == nil {
		return
	}

	key := fmt.Sprintf("%s%s/%s", bizPolicyCachePrefix, owner, appName)
	ctx := context.Background()
	if err := client.Del(ctx, key).Err(); err != nil {
		logs.Warning("biz policy cache: clear failed for %s/%s: %v", owner, appName, err)
	}
}
