//go:build !windows

package main

import (
	"fmt"
	"os"
	"os/exec"
	"runtime"
)

// Non-Windows builds exist for development and tests.

func openAppWindow(url string) error {
	opener := "xdg-open"
	if runtime.GOOS == "darwin" {
		opener = "open"
	}
	if err := exec.Command(opener, url).Start(); err != nil {
		fmt.Println("Open", url, "in your browser")
	}
	return nil
}

func ensureDesktopShortcut() {}

func showError(message string) { fmt.Fprintln(os.Stderr, message) }
