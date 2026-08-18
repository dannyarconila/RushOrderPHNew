import { Download, Share, Smartphone, X } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  prompt(): Promise<void>;
  userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
}

declare global {
  interface WindowEventMap {
    beforeinstallprompt: BeforeInstallPromptEvent;
  }
}

function isIos() {
  return (
    /iphone|ipad|ipod/i.test(window.navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

function isStandalone() {
  const navigatorWithStandalone = window.navigator as Navigator & {
    standalone?: boolean;
  };

  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    navigatorWithStandalone.standalone === true
  );
}

export function InstallAppButton() {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [showGuide, setShowGuide] = useState(false);

  useEffect(() => {
    if (isStandalone()) {
      setInstalled(true);
      return;
    }

    const handleBeforeInstallPrompt = (event: BeforeInstallPromptEvent) => {
      event.preventDefault();
      setInstallPrompt(event);
    };

    const handleAppInstalled = () => {
      setInstalled(true);
      setInstallPrompt(null);
      setShowGuide(false);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  if (installed) return null;

  const handleInstall = async () => {
    if (installPrompt) {
      await installPrompt.prompt();

      const choice = await installPrompt.userChoice;

      if (choice.outcome === "accepted") {
        setInstalled(true);
      }

      setInstallPrompt(null);
      return;
    }

    setShowGuide(true);
  };

  return (
    <>
      <Button
        size="lg"
        variant="outline"
        onClick={handleInstall}
        className="border-ink-foreground/25 bg-transparent text-ink-foreground hover:bg-ink-foreground/10"
      >
        <Download className="size-4" />
        Install App
      </Button>

      {showGuide ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 px-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="install-app-title"
        >
          <div className="relative w-full max-w-md rounded-3xl border border-border bg-card p-6 text-foreground shadow-[var(--shadow-lifted)] sm:p-8">
            <button
              type="button"
              onClick={() => setShowGuide(false)}
              aria-label="Close install instructions"
              className="absolute right-4 top-4 rounded-full p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <X className="size-5" />
            </button>

            <div className="flex size-12 items-center justify-center rounded-2xl bg-primary-soft text-primary">
              <Smartphone className="size-6" />
            </div>

            <h2 id="install-app-title" className="mt-5 font-display text-2xl font-extrabold">
              Install RushOrder PH
            </h2>

            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Add RushOrder PH to your Home Screen for faster access, just like an app.
            </p>

            {isIos() ? (
              <div className="mt-6 space-y-4">
                <div className="rounded-2xl bg-muted/60 p-4">
                  <p className="font-bold">iPhone / iPad</p>

                  <ol className="mt-3 space-y-3 text-sm text-muted-foreground">
                    <li className="flex gap-3">
                      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                        1
                      </span>
                      <span>
                        Tap the <strong className="text-foreground">Share</strong> button in Safari.
                      </span>
                    </li>

                    <li className="flex gap-3">
                      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                        2
                      </span>
                      <span>
                        Scroll down and tap{" "}
                        <strong className="text-foreground">Add to Home Screen</strong>.
                      </span>
                    </li>

                    <li className="flex gap-3">
                      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                        3
                      </span>
                      <span>
                        Tap <strong className="text-foreground">Add</strong>.
                      </span>
                    </li>
                  </ol>

                  <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
                    <Share className="size-4" />
                    Safari's Share button is usually at the bottom of the screen.
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-6 space-y-4">
                <div className="rounded-2xl bg-muted/60 p-4">
                  <p className="font-bold">Android</p>

                  <ol className="mt-3 space-y-3 text-sm text-muted-foreground">
                    <li className="flex gap-3">
                      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                        1
                      </span>
                      <span>
                        Tap the <strong className="text-foreground">⋮</strong> menu in Chrome.
                      </span>
                    </li>

                    <li className="flex gap-3">
                      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                        2
                      </span>
                      <span>
                        Tap <strong className="text-foreground">Install app</strong> or{" "}
                        <strong className="text-foreground">Add to Home screen</strong>.
                      </span>
                    </li>

                    <li className="flex gap-3">
                      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                        3
                      </span>
                      <span>
                        Confirm by tapping <strong className="text-foreground">Install</strong> or{" "}
                        <strong className="text-foreground">Add</strong>.
                      </span>
                    </li>
                  </ol>
                </div>
              </div>
            )}

            <Button className="mt-6 w-full" onClick={() => setShowGuide(false)}>
              Got it
            </Button>
          </div>
        </div>
      ) : null}
    </>
  );
}
