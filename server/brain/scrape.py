"""Headless fallback for JS-rendered pages (Khan Academy, Bitesize...).
Usage: python scrape.py <url>   -> prints {"title": ..., "text": ...} to stdout.
No LLM involved: we only need the page rendered and its text. Claude does the
thinking later, on the Node side. Called by source.ts when a plain fetch
returns a JS shell."""

import asyncio
import json
import sys

from browser_use import Browser
from browser_use.browser.events import NavigateToUrlEvent

# innerText of the main content area, plus any transcript panel a video page
# exposes. Falls back to the whole body. Newlines are joined with a space so
# the script stays a single-line-safe JS expression.
SCRIPT = """
(() => {
  const pick = (sel) => [...document.querySelectorAll(sel)].map(e => e.innerText).join(' ');
  const transcript = pick('[class*="transcript" i], [data-test-id*="transcript" i]');
  const main = pick('main, article, [role="main"]') || document.body.innerText;
  return JSON.stringify({ title: document.title, text: (main + ' ' + transcript).trim() });
})()
"""


async def scrape(url: str) -> dict:
    browser = Browser(headless=True)
    await browser.start()
    try:
        await browser.event_bus.dispatch(NavigateToUrlEvent(url=url))
        await asyncio.sleep(4)  # let the SPA hydrate
        session = await browser.get_or_create_cdp_session()
        result = await session.cdp_client.send.Runtime.evaluate(
            params={"expression": SCRIPT, "returnByValue": True},
            session_id=session.session_id,
        )
        r = result.get("result", {})
        if "value" not in r:
            raise RuntimeError(f"evaluate failed: {result.get('exceptionDetails') or r}")
        return json.loads(r["value"])
    finally:
        await browser.stop()


if __name__ == "__main__":
    print(json.dumps(asyncio.run(scrape(sys.argv[1]))))
