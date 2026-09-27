package main

import (
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
	"testing/fstest"
	"time"
)

var site = fstest.MapFS{
	"index.html":        {Data: []byte("<html>app</html>")},
	"assets/app-123.js": {Data: []byte("console.log(1)")},
	"favicon.svg":       {Data: []byte("<svg/>")},
}

func get(t *testing.T, h http.Handler, path string) (*http.Response, string) {
	t.Helper()
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, path, nil))
	res := rec.Result()
	body, _ := io.ReadAll(res.Body)
	return res, string(body)
}

func TestServesAppAndFallsBackToIndex(t *testing.T) {
	h := newHandler(site, newIdleTracker(time.Now()), time.Now)
	for _, p := range []string{"/", "/some/deep/link", "/index.html"} {
		res, body := get(t, h, p)
		if res.StatusCode != 200 || body != "<html>app</html>" {
			t.Fatalf("%s: got %d %q", p, res.StatusCode, body)
		}
		if res.Header.Get("Cache-Control") != "no-cache" {
			t.Fatalf("%s: index must not be cached long-term", p)
		}
	}
	res, body := get(t, h, "/assets/app-123.js")
	if body != "console.log(1)" || res.Header.Get("Cache-Control") == "no-cache" {
		t.Fatalf("asset: %q %q", body, res.Header.Get("Cache-Control"))
	}
}

func TestHealthAndHeartbeat(t *testing.T) {
	now := time.Unix(1000, 0)
	tracker := newIdleTracker(now)
	h := newHandler(site, tracker, func() time.Time { return now })

	if _, body := get(t, h, healthPath); body != healthBody {
		t.Fatalf("health: %q", body)
	}
	if res, _ := get(t, h, heartbeatPath); res.StatusCode != http.StatusNoContent {
		t.Fatalf("heartbeat status %d", res.StatusCode)
	}
	if tracker.idle(now.Add(2*time.Minute), 3*time.Minute, time.Minute) {
		t.Fatal("should not be idle 2 minutes after a heartbeat")
	}
	if !tracker.idle(now.Add(4*time.Minute), 3*time.Minute, time.Minute) {
		t.Fatal("should be idle 4 minutes after the last heartbeat")
	}
}

func TestIdleWhenNoWindowEverOpens(t *testing.T) {
	start := time.Unix(0, 0)
	tracker := newIdleTracker(start)
	if tracker.idle(start.Add(time.Minute), time.Minute, 5*time.Minute) {
		t.Fatal("still within the startup grace period")
	}
	if !tracker.idle(start.Add(6*time.Minute), time.Minute, 5*time.Minute) {
		t.Fatal("should quit if no window ever checked in")
	}
}

func TestIsOurApp(t *testing.T) {
	ours := httptest.NewServer(newHandler(site, newIdleTracker(time.Now()), time.Now))
	defer ours.Close()
	other := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { _, _ = w.Write([]byte("hello")) }))
	defer other.Close()
	if !isOurApp(ours.Listener.Addr().String()) {
		t.Fatal("should recognise a running launcher")
	}
	if isOurApp(other.Listener.Addr().String()) {
		t.Fatal("should not mistake another server for the launcher")
	}
}
