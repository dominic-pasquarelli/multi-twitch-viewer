package main

import (
	"encoding/json"
	"io/fs"
	"net"
	"net/http"
	"path"
	"strings"
	"sync"
	"time"
)

// Paths used by the web app to talk to the launcher.
const (
	healthPath    = "/__mtv/health"
	heartbeatPath = "/__mtv/heartbeat"
	versionPath   = "/__mtv/version"
	healthBody    = "multi-twitch-viewer"
)

// idleTracker records the last time an app window checked in, so the
// launcher can quit once every window has been closed.
type idleTracker struct {
	mu       sync.Mutex
	started  time.Time
	lastBeat time.Time
}

func newIdleTracker(now time.Time) *idleTracker { return &idleTracker{started: now} }

func (t *idleTracker) beat(now time.Time) {
	t.mu.Lock()
	t.lastBeat = now
	t.mu.Unlock()
}

// idle reports whether the launcher should shut down: no window has checked
// in for `timeout`, or none ever opened within `startupGrace`.
func (t *idleTracker) idle(now time.Time, timeout, startupGrace time.Duration) bool {
	t.mu.Lock()
	defer t.mu.Unlock()
	if t.lastBeat.IsZero() {
		return now.Sub(t.started) > startupGrace
	}
	return now.Sub(t.lastBeat) > timeout
}

// newHandler serves the embedded single-page app. Unknown paths fall back to
// index.html; hashed assets are cached, index.html is not (so updates show).
func newHandler(site fs.FS, tracker *idleTracker, now func() time.Time) http.Handler {
	files := http.FileServer(http.FS(site))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case healthPath:
			w.Header().Set("Cache-Control", "no-store")
			_, _ = w.Write([]byte(healthBody))
			return
		case versionPath:
			w.Header().Set("Cache-Control", "no-store")
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(map[string]string{"version": version, "commit": commit})
			return
		case heartbeatPath:
			tracker.beat(now())
			w.Header().Set("Cache-Control", "no-store")
			w.WriteHeader(http.StatusNoContent)
			return
		}

		name := strings.TrimPrefix(path.Clean(r.URL.Path), "/")
		if name == "" {
			name = "index.html"
		}
		if info, err := fs.Stat(site, name); err != nil || info.IsDir() {
			name = "index.html"
		}
		if name == "index.html" {
			// FileServer redirects /index.html to /, so always ask for "/".
			r = r.Clone(r.Context())
			r.URL.Path = "/"
		}
		if strings.HasPrefix(name, "assets/") {
			w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
		} else {
			w.Header().Set("Cache-Control", "no-cache")
		}
		files.ServeHTTP(w, r)
	})
}

// isOurApp reports whether an already-running launcher answers on addr.
func isOurApp(addr string) bool {
	client := http.Client{Timeout: 2 * time.Second}
	res, err := client.Get("http://" + addr + healthPath)
	if err != nil {
		return false
	}
	defer res.Body.Close()
	buf := make([]byte, len(healthBody))
	n, _ := res.Body.Read(buf)
	return res.StatusCode == http.StatusOK && string(buf[:n]) == healthBody
}

// listen binds to localhost only, so nothing on the network can reach it.
func listen(port string) (net.Listener, error) {
	return net.Listen("tcp", "127.0.0.1:"+port)
}
