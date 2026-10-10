// Copyright 2026 The JetAuth Authors. All Rights Reserved.
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

// permission_enforcer_watcher.go propagates permission enforcer cache
// invalidations between JetAuth instances over Redis pub/sub, so a policy or
// role change on instance A takes effect on instance B immediately instead of
// after the cache TTL. Opt-in via permissionEnforcerWatcherEnabled.
//
// It follows the pub/sub conventions of biz_rebac_cache_redis.go: it reuses
// redisEndpoint, tolerates Redis being unreachable at boot (the TTL then
// remains the staleness bound), and flushes the local cache whenever the
// subscription may have missed messages.

package object

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"strconv"
	"time"

	"github.com/beego/beego/v2/core/logs"
	"github.com/deluxebear/jetauth/conf"
	"github.com/deluxebear/jetauth/util"
	"github.com/redis/go-redis/v9"
)

const defaultPermissionEnforcerChannel = "jetauth:permission-enforcer:invalidations"

// permissionEnforcerInvalidateMsg is the pub/sub payload.
type permissionEnforcerInvalidateMsg struct {
	Origin string   `json:"origin"`
	Scope  string   `json:"scope"`
	Values []string `json:"values,omitempty"`
}

type permissionEnforcerWatcher struct {
	client  *redis.Client
	sub     *redis.PubSub
	channel string
	origin  string
}

func newInstanceId() string {
	buf := make([]byte, 8)
	if _, err := rand.Read(buf); err != nil {
		return util.GenerateId()
	}
	return hex.EncodeToString(buf)
}

// initPermissionEnforcerWatcher is called by InitPermissionEnforcerCache.
// Any failure degrades to local-only invalidation + TTL.
func initPermissionEnforcerWatcher() {
	if !conf.GetConfigBool("permissionEnforcerWatcherEnabled") {
		return
	}

	addr := conf.GetConfigString("permissionEnforcerWatcherAddr")
	if addr == "" {
		addr = conf.GetConfigString("redisEndpoint")
	}
	if addr == "" {
		logs.Warning("permission enforcer watcher: enabled but no Redis address (permissionEnforcerWatcherAddr / redisEndpoint); using TTL-only expiry across instances")
		return
	}

	db := 0
	if dbStr := conf.GetConfigString("permissionEnforcerWatcherDB"); dbStr != "" {
		if n, err := strconv.Atoi(dbStr); err == nil {
			db = n
		} else {
			logs.Warning("permission enforcer watcher: invalid permissionEnforcerWatcherDB=%q, using 0", dbStr)
		}
	}
	channel := conf.GetConfigString("permissionEnforcerWatcherChannel")
	if channel == "" {
		channel = defaultPermissionEnforcerChannel
	}

	client := redis.NewClient(&redis.Options{
		Addr:     addr,
		Password: conf.GetConfigString("permissionEnforcerWatcherPassword"),
		DB:       db,
	})

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	if err := client.Ping(ctx).Err(); err != nil {
		_ = client.Close()
		logs.Warning("permission enforcer watcher: Redis unreachable at %s, using TTL-only expiry across instances: %v", addr, err)
		return
	}

	w := &permissionEnforcerWatcher{
		client:  client,
		channel: channel,
		origin:  newInstanceId(),
	}
	w.sub = client.Subscribe(context.Background(), channel)
	if _, err := w.sub.Receive(ctx); err != nil {
		_ = w.sub.Close()
		_ = client.Close()
		logs.Warning("permission enforcer watcher: subscribe failed, using TTL-only expiry across instances: %v", err)
		return
	}

	permissionEnforcerBroadcaster = w.publish
	util.SafeGoroutine(w.consume)
	logs.Info("permission enforcer watcher: connected at %s, channel=%q", addr, channel)
}

func (w *permissionEnforcerWatcher) publish(scope string, values []string) {
	raw, err := json.Marshal(permissionEnforcerInvalidateMsg{Origin: w.origin, Scope: scope, Values: values})
	if err != nil {
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	if err := w.client.Publish(ctx, w.channel, raw).Err(); err != nil {
		logs.Warning("permission enforcer watcher: publish failed, peers fall back to TTL expiry: %v", err)
	}
}

const permissionEnforcerHeartbeat = 15 * time.Second

func (w *permissionEnforcerWatcher) consume() {
	ch := w.sub.Channel()
	ticker := time.NewTicker(permissionEnforcerHeartbeat)
	defer ticker.Stop()

	disconnected := false
	for {
		select {
		case <-ticker.C:
			ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
			err := w.sub.Ping(ctx)
			cancel()
			switch {
			case err != nil && !disconnected:
				disconnected = true
				logs.Warning("permission enforcer watcher: heartbeat failed, flushing local cache: %v", err)
				applyPermissionEnforcerInvalidation(permissionEnforcerScopeAll, nil, "remote")
			case err == nil && disconnected:
				// Messages published during the outage were lost.
				disconnected = false
				logs.Info("permission enforcer watcher: heartbeat recovered, flushing local cache")
				applyPermissionEnforcerInvalidation(permissionEnforcerScopeAll, nil, "remote")
			}
		case m, ok := <-ch:
			if !ok {
				return
			}
			w.handle([]byte(m.Payload))
		}
	}
}

func (w *permissionEnforcerWatcher) handle(payload []byte) {
	var msg permissionEnforcerInvalidateMsg
	if err := json.Unmarshal(payload, &msg); err != nil {
		// Unknown payload: be pessimistic.
		logs.Warning("permission enforcer watcher: malformed message, flushing local cache: %v", err)
		applyPermissionEnforcerInvalidation(permissionEnforcerScopeAll, nil, "remote")
		return
	}
	if msg.Origin == w.origin {
		return // our own echo, already applied locally
	}
	applyPermissionEnforcerInvalidation(msg.Scope, msg.Values, "remote")
}
