// Copyright 2026 The JetAuth Authors. All Rights Reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.

// Task API — a tiny demo service designed to sit behind the JetAuth WAF
// gateway with URL-level authorization turned on. It reads the identity
// headers the gateway injects (X-Forwarded-User / -Email) and exposes a
// mix of CRUD, reporting, and admin endpoints so different roles in the
// Application Authorization module produce visibly different behavior.
//
// Run:   PORT=8081 go run ./demo/task-api
// Spec:  GET /openapi.yaml   (suitable for "Import OpenAPI" in JetAuth)
package main

import (
	"embed"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"
)

//go:embed openapi.yaml index.html
var assets embed.FS

type Task struct {
	ID          int       `json:"id"`
	Title       string    `json:"title"`
	Status      string    `json:"status"` // "todo" | "doing" | "done"
	Assignee    string    `json:"assignee"`
	CreatedTime time.Time `json:"createdTime"`
}

type store struct {
	mu     sync.Mutex
	nextID int
	items  map[int]*Task
}

func newStore() *store {
	s := &store{nextID: 1, items: map[int]*Task{}}
	s.create(&Task{Title: "Draft Q2 roadmap", Status: "doing", Assignee: "alice"})
	s.create(&Task{Title: "Review auth rollout", Status: "todo", Assignee: "bob"})
	s.create(&Task{Title: "Write demo docs", Status: "done", Assignee: "alice"})
	return s
}

func (s *store) list() []*Task {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := make([]*Task, 0, len(s.items))
	for _, t := range s.items {
		out = append(out, t)
	}
	return out
}

func (s *store) get(id int) *Task {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.items[id]
}

func (s *store) create(t *Task) *Task {
	s.mu.Lock()
	defer s.mu.Unlock()
	t.ID = s.nextID
	s.nextID++
	t.CreatedTime = time.Now()
	s.items[t.ID] = t
	return t
}

func (s *store) update(id int, patch *Task) *Task {
	s.mu.Lock()
	defer s.mu.Unlock()
	t := s.items[id]
	if t == nil {
		return nil
	}
	if patch.Title != "" {
		t.Title = patch.Title
	}
	if patch.Status != "" {
		t.Status = patch.Status
	}
	if patch.Assignee != "" {
		t.Assignee = patch.Assignee
	}
	return t
}

func (s *store) delete(id int) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, ok := s.items[id]; !ok {
		return false
	}
	delete(s.items, id)
	return true
}

// identity pulls the gateway-forwarded user info. When the app is run
// directly (no WAF in front) the headers are empty; we surface that so
// the operator can tell "bypassed gateway" from "allowed by gateway".
type identity struct {
	User  string `json:"user"`
	Email string `json:"email"`
}

func identityOf(r *http.Request) identity {
	return identity{
		User:  r.Header.Get("X-Forwarded-User"),
		Email: r.Header.Get("X-Forwarded-Email"),
	}
}

func writeJSON(w http.ResponseWriter, status int, body interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

func writeErr(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}

// parseTaskID extracts the trailing /{id} segment from paths like
// /api/tasks/42. Returns 0 when the segment is missing or non-numeric.
func parseTaskID(path, prefix string) int {
	rest := strings.TrimPrefix(path, prefix)
	rest = strings.Trim(rest, "/")
	if rest == "" {
		return 0
	}
	n, err := strconv.Atoi(rest)
	if err != nil {
		return 0
	}
	return n
}

type server struct {
	store *store
}

func (s *server) routes() *http.ServeMux {
	mux := http.NewServeMux()

	mux.HandleFunc("/", s.handleIndex)
	mux.HandleFunc("/openapi.yaml", s.handleSpec)
	mux.HandleFunc("/api/health", s.handleHealth)
	mux.HandleFunc("/api/me", s.handleMe)
	mux.HandleFunc("/api/tasks", s.handleTasks)
	mux.HandleFunc("/api/tasks/", s.handleTaskByID)
	mux.HandleFunc("/api/reports/summary", s.handleReportSummary)
	mux.HandleFunc("/api/reports/export", s.handleReportExport)
	mux.HandleFunc("/api/admin/audit", s.handleAdminAudit)
	mux.HandleFunc("/api/admin/broadcast", s.handleAdminBroadcast)
	return mux
}

func (s *server) handleIndex(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path != "/" {
		http.NotFound(w, r)
		return
	}
	b, err := assets.ReadFile("index.html")
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "missing index.html")
		return
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	_, _ = w.Write(b)
}

func (s *server) handleSpec(w http.ResponseWriter, r *http.Request) {
	b, err := assets.ReadFile("openapi.yaml")
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "missing openapi.yaml")
		return
	}
	w.Header().Set("Content-Type", "application/yaml")
	_, _ = w.Write(b)
}

func (s *server) handleHealth(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{
		"status": "ok",
		"time":   time.Now().Format(time.RFC3339),
	})
}

func (s *server) handleMe(w http.ResponseWriter, r *http.Request) {
	id := identityOf(r)
	if id.User == "" {
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"identity":     id,
			"gatewayNote":  "no X-Forwarded-User header — request did not pass through the JetAuth WAF",
		})
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{"identity": id})
}

func (s *server) handleTasks(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		writeJSON(w, http.StatusOK, s.store.list())
	case http.MethodPost:
		var t Task
		if err := json.NewDecoder(r.Body).Decode(&t); err != nil {
			writeErr(w, http.StatusBadRequest, "invalid json")
			return
		}
		if t.Title == "" {
			writeErr(w, http.StatusBadRequest, "title is required")
			return
		}
		if t.Status == "" {
			t.Status = "todo"
		}
		if t.Assignee == "" {
			t.Assignee = identityOf(r).User
		}
		writeJSON(w, http.StatusCreated, s.store.create(&t))
	default:
		writeErr(w, http.StatusMethodNotAllowed, "method not allowed")
	}
}

func (s *server) handleTaskByID(w http.ResponseWriter, r *http.Request) {
	id := parseTaskID(r.URL.Path, "/api/tasks/")
	if id == 0 {
		writeErr(w, http.StatusBadRequest, "invalid task id")
		return
	}
	switch r.Method {
	case http.MethodGet:
		t := s.store.get(id)
		if t == nil {
			writeErr(w, http.StatusNotFound, "task not found")
			return
		}
		writeJSON(w, http.StatusOK, t)
	case http.MethodPut, http.MethodPatch:
		var patch Task
		if err := json.NewDecoder(r.Body).Decode(&patch); err != nil {
			writeErr(w, http.StatusBadRequest, "invalid json")
			return
		}
		t := s.store.update(id, &patch)
		if t == nil {
			writeErr(w, http.StatusNotFound, "task not found")
			return
		}
		writeJSON(w, http.StatusOK, t)
	case http.MethodDelete:
		if !s.store.delete(id) {
			writeErr(w, http.StatusNotFound, "task not found")
			return
		}
		w.WriteHeader(http.StatusNoContent)
	default:
		writeErr(w, http.StatusMethodNotAllowed, "method not allowed")
	}
}

func (s *server) handleReportSummary(w http.ResponseWriter, r *http.Request) {
	tasks := s.store.list()
	counts := map[string]int{"todo": 0, "doing": 0, "done": 0}
	for _, t := range tasks {
		counts[t.Status]++
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"total":       len(tasks),
		"byStatus":    counts,
		"generatedBy": identityOf(r).User,
	})
}

func (s *server) handleReportExport(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/csv")
	w.Header().Set("Content-Disposition", `attachment; filename="tasks.csv"`)
	_, _ = fmt.Fprintln(w, "id,title,status,assignee,createdTime")
	for _, t := range s.store.list() {
		_, _ = fmt.Fprintf(w, "%d,%q,%s,%s,%s\n", t.ID, t.Title, t.Status, t.Assignee, t.CreatedTime.Format(time.RFC3339))
	}
}

func (s *server) handleAdminAudit(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"note":    "pretend this is an audit log — only admins should see it",
		"caller":  identityOf(r),
		"entries": []string{"task#1 created by alice", "task#3 status→done by alice"},
	})
}

func (s *server) handleAdminBroadcast(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeErr(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	var body struct {
		Message string `json:"message"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Message == "" {
		writeErr(w, http.StatusBadRequest, "message is required")
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"delivered": true,
		"message":   body.Message,
		"sentBy":    identityOf(r).User,
	})
}

func logMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		next.ServeHTTP(w, r)
		log.Printf("%s %s user=%q email=%q in=%s",
			r.Method, r.URL.Path,
			r.Header.Get("X-Forwarded-User"),
			r.Header.Get("X-Forwarded-Email"),
			time.Since(start))
	})
}

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8081"
	}
	srv := &server{store: newStore()}
	addr := ":" + port
	log.Printf("task-api demo listening on %s — try http://localhost%s/", addr, addr)
	if err := http.ListenAndServe(addr, logMiddleware(srv.routes())); err != nil {
		log.Fatal(err)
	}
}
