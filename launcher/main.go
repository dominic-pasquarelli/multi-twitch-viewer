// Command MultiTwitchViewer is a one-file Windows launcher for the web app:
// it serves the embedded build on http://localhost:5757, opens it in its own
// Chrome/Edge window, and quits by itself once that window is closed.
package main

import (
	"embed"
	"fmt"
	"io/fs"
	"net/http"
	"os"
	"time"
)

//go:embed all:web
var embedded embed.FS

const (
	// Must match the OAuth Redirect URL registered with Twitch, and keeps saved
	// presets in the same browser storage as `npm start`.
	port = "5757"
	url  = "http://localhost:" + port + "/"

	idleTimeout  = 3 * time.Minute // browsers may throttle hidden windows to 1 timer/minute
	startupGrace = 5 * time.Minute
)

func main() {
	if err := run(); err != nil {
		showError(err.Error())
		os.Exit(1)
	}
}

func run() error {
	site, err := fs.Sub(embedded, "web")
	if err != nil {
		return err
	}
	if _, err := fs.Stat(site, "index.html"); err != nil {
		return fmt.Errorf("this launcher was built without the web app (run `npm run build:windows`)")
	}

	ln, err := listen(port)
	if err != nil {
		// Already running? Just open another window onto it.
		if isOurApp("127.0.0.1:" + port) {
			return openAppWindow(url)
		}
		return fmt.Errorf("port %s is being used by another program, so Multi Twitch Viewer can't start.\n\nClose that program and try again.", port)
	}

	tracker := newIdleTracker(time.Now())
	server := &http.Server{Handler: newHandler(site, tracker, time.Now), ReadHeaderTimeout: 10 * time.Second}
	go func() { _ = server.Serve(ln) }()

	ensureDesktopShortcut()
	if err := openAppWindow(url); err != nil {
		return err
	}

	for range time.Tick(15 * time.Second) {
		if tracker.idle(time.Now(), idleTimeout, startupGrace) {
			return server.Close()
		}
	}
	return nil
}
