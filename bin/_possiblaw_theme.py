#!/usr/bin/env python3
"""PossibLaw UI theme helper (stdlib only).

Patches paperclip's BUILT ui/dist/index.html into a themed copy for the
launcher's server/ui-dist overlay. Three insertions, all robust against
vite minification of the stock inline theme script:

  1. A seed script at the TOP of <head> that sets
     localStorage["paperclip.theme"] = "light" only when the user has no
     stored preference. The stock theme script (which runs later in <head>)
     then applies light mode before first paint. A user's manual toggle
     persists and is never overridden.
  2. Every overlay theme: a <style id="possiblaw-sidebar-perf"> block before
     </head> applying content-visibility to sidebar agent rows so a
     large agent catalog (174+) scrolls smoothly. --theme dark removes the
     whole overlay, restoring stock behavior.
  3. theme "possiblaw" only: a <style id="possiblaw-theme"> block appended
     before </head> that warms the light palette (cream background, coral
     primary) by overriding the :root design tokens. Dark mode tokens are
     untouched, so the in-app toggle still yields stock dark.

Usage:
  _possiblaw_theme.py --patch-index --theme <light|possiblaw> \
      --src <built-index.html> --dest <patched-index.html>
  _possiblaw_theme.py --self-test
"""

import argparse
import sys

THEMES = ("light", "possiblaw")

SEED_SCRIPT = (
    "<script>/* possiblaw: default new browsers to light mode; never override "
    "a stored user choice */try{var k=\"paperclip.theme\";"
    "if(!window.localStorage.getItem(k))window.localStorage.setItem(k,\"light\");}"
    "catch(e){}</script>"
)

SIDEBAR_PERF_STYLE = """<style id="possiblaw-sidebar-perf">
/* PossibLaw: large-catalog sidebar mitigation. Off-screen agent rows skip
   layout/paint via content-visibility; the intrinsic-size hint keeps scroll
   geometry stable before rows render. Selector is the Tailwind named-group
   class on SidebarAgentItem's row wrapper (ui/src/components/
   SidebarAgents.tsx) — utility class strings survive the vite build verbatim. */
.group\\/agent {
  content-visibility: auto;
  contain-intrinsic-size: auto 32px;
}
</style>"""

POSSIBLAW_STYLE = """<style id="possiblaw-theme">
/* PossibLaw launch theme: warm, light-first overrides of paperclip's
   :root (light mode) design tokens. Dark mode is left stock. */
:root {
  --background: oklch(0.992 0.008 90);
  --secondary: oklch(0.962 0.016 85);
  --muted: oklch(0.962 0.016 85);
  --accent: oklch(0.95 0.028 85);
  --accent-foreground: oklch(0.34 0.06 55);
  --primary: oklch(0.62 0.15 45);
  --primary-foreground: oklch(0.99 0 0);
  --ring: oklch(0.62 0.15 45);
  --sidebar: oklch(0.974 0.014 85);
  --sidebar-primary: oklch(0.62 0.15 45);
  --sidebar-primary-foreground: oklch(0.99 0 0);
  --sidebar-accent: oklch(0.944 0.03 85);
  --sidebar-accent-foreground: oklch(0.34 0.06 55);
  --sidebar-ring: oklch(0.62 0.15 45);
}
</style>"""


def patch_index_html(html: str, theme: str) -> str:
    """Return the patched index.html text. Raises ValueError when the
    expected anchors are missing (caller treats that as patch failure)."""
    if theme not in THEMES:
        raise ValueError(f"unknown theme '{theme}'; expected one of {THEMES}")

    head_open = html.find("<head>")
    if head_open == -1:
        head_open = html.find("<head ")
    if head_open == -1:
        raise ValueError("no <head> tag found in index.html")
    head_open_end = html.find(">", head_open)
    if head_open_end == -1:
        raise ValueError("malformed <head> tag in index.html")
    insert_at = head_open_end + 1
    html = html[:insert_at] + "\n    " + SEED_SCRIPT + html[insert_at:]

    head_close = html.find("</head>")
    if head_close == -1:
        raise ValueError("no </head> tag found in index.html")
    blocks = [SIDEBAR_PERF_STYLE]
    if theme == "possiblaw":
        blocks.append(POSSIBLAW_STYLE)
    insertion = "".join("    " + block + "\n  " for block in blocks)
    html = html[:head_close] + insertion + html[head_close:]

    return html


def self_test() -> int:
    sample = (
        "<!DOCTYPE html>\n"
        '<html lang="en" class="dark">\n'
        "  <head>\n"
        '    <meta charset="UTF-8" />\n'
        "    <script>const t=s===\"light\"||s===\"dark\"?s:\"dark\";</script>\n"
        "  </head>\n"
        "  <body><div id=\"root\"></div></body>\n"
        "</html>\n"
    )

    # light: seed script lands before the stock script, no style block
    out = patch_index_html(sample, "light")
    assert SEED_SCRIPT in out, "seed script missing (light)"
    assert out.index(SEED_SCRIPT) < out.index("const t="), "seed must precede stock script"
    assert "possiblaw-theme" not in out, "light theme must not inject the palette"

    # possiblaw: seed script + palette style before </head>
    out2 = patch_index_html(sample, "possiblaw")
    assert SEED_SCRIPT in out2, "seed script missing (possiblaw)"
    assert '<style id="possiblaw-theme">' in out2, "palette style missing"
    assert out2.index("possiblaw-theme") < out2.index("</head>"), "style must sit inside <head>"
    assert out2.index(SEED_SCRIPT) < out2.index("possiblaw-theme"), "seed first, style last"

    # sidebar perf block: every overlay theme gets it, exactly once, in <head>.
    # Selector must be the escaped Tailwind named-group class on
    # SidebarAgentItem's row wrapper (ui/src/components/SidebarAgents.tsx).
    for theme_name, themed_out in (("light", out), ("possiblaw", out2)):
        count = themed_out.count('<style id="possiblaw-sidebar-perf">')
        assert count == 1, f"sidebar perf block count {count} != 1 ({theme_name})"
        assert "content-visibility: auto" in themed_out, f"content-visibility missing ({theme_name})"
        assert "contain-intrinsic-size: auto" in themed_out, f"intrinsic-size hint missing ({theme_name})"
        assert ".group\\/agent" in themed_out, f"escaped row selector missing ({theme_name})"
        assert themed_out.index("possiblaw-sidebar-perf") < themed_out.index("</head>"), (
            f"perf block must sit inside <head> ({theme_name})"
        )

    # idempotence guard: patching is single-shot by design; the launcher
    # always patches a fresh copy from ui/dist, so double-patching is a bug
    # in the caller — but the output must still parse for the anchors.
    assert "</head>" in out2 and "<head>" in out2

    # error paths
    for bad_theme in ("dark", "neon"):
        try:
            patch_index_html(sample, bad_theme)
        except ValueError:
            pass
        else:
            raise AssertionError(f"theme '{bad_theme}' should be rejected")
    try:
        patch_index_html("<html><body></body></html>", "light")
    except ValueError:
        pass
    else:
        raise AssertionError("missing <head> should be rejected")

    print("OK: _possiblaw_theme self-test passed")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--patch-index", action="store_true")
    parser.add_argument("--theme", choices=THEMES)
    parser.add_argument("--src")
    parser.add_argument("--dest")
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()

    if args.self_test:
        return self_test()

    if args.patch_index:
        if not (args.theme and args.src and args.dest):
            parser.error("--patch-index requires --theme, --src, and --dest")
        with open(args.src, encoding="utf-8") as f:
            html = f.read()
        patched = patch_index_html(html, args.theme)
        with open(args.dest, "w", encoding="utf-8") as f:
            f.write(patched)
        return 0

    parser.error("nothing to do: pass --patch-index or --self-test")
    return 2


if __name__ == "__main__":
    sys.exit(main())
