#!/usr/bin/env python3
"""Live CDP verification: whole-file Inspect on the deployed site.
Real mouse events for X-button and arrow clicks."""
import json, subprocess, time, urllib.request, sys, base64
import websocket

CHROME = "/opt/meta-chromium/chrome"
PORT = 9233
APP = "file:///home/hatch/workspace/artic-viewr/index.html"
APP_VERSION = "app.js?v=33233cc"
JSONL = "/home/hatch/workspace/user/files/u__ak47___posts.jsonl_0_4mqp.json"
SHOT = "/home/hatch/workspace/user/media_library/browser_screenshots/artic_wholefile_inspect.png"

proc = subprocess.Popen([CHROME, "--headless=old", f"--remote-debugging-port={PORT}",
    "--remote-allow-origins=*", "--no-sandbox", "--disable-gpu",
    "--window-size=1280,900", "about:blank"],
    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
for _ in range(30):
    time.sleep(1)
    try:
        urllib.request.urlopen(f"http://127.0.0.1:{PORT}/json/list", timeout=2).read()
        break
    except Exception:
        pass
ws = None; mid = 0
results = []
def check(name, cond, extra=""):
    results.append((name, bool(cond)))
    print(("PASS " if cond else "FAIL ") + name + (f" [{extra}]" if extra else ""))
try:
    tabs = json.load(urllib.request.urlopen(f"http://127.0.0.1:{PORT}/json/list"))
    page = [t for t in tabs if t["type"] == "page"][0]
    ws = websocket.create_connection(page["webSocketDebuggerUrl"], timeout=20)
    def send(method, params=None):
        global mid
        mid += 1
        ws.send(json.dumps({"id": mid, "method": method, "params": params or {}}))
        while True:
            m = json.loads(ws.recv())
            if m.get("id") == mid:
                if "error" in m: raise RuntimeError(f"{method}: {m['error']}")
                return m.get("result", {})
    def ev(js):
        r = send("Runtime.evaluate", {"expression": js, "returnByValue": True})
        res = r.get("result", {})
        if res.get("subtype") == "error": raise RuntimeError("JS: " + res.get("description", "?"))
        return res.get("value")
    def counter_text():
        return ev('[...document.querySelectorAll("span")].map(s=>s.textContent).find(t=>/\\d+ of \\d+/.test(t))')
    def real_click(selector, expect_hit=None):
        ev(f'document.querySelector(\'{selector}\').scrollIntoView({{block:"center"}})')
        time.sleep(0.4)
        rect = json.loads(ev(f'JSON.stringify(document.querySelector(\'{selector}\').getBoundingClientRect())'))
        x, y = rect["x"] + rect["width"]/2, rect["y"] + rect["height"]/2
        hit = ev(f'(document.elementFromPoint({x},{y})?.closest("[data-action]")?.dataset?.action) ?? "none"')
        if expect_hit:
            check(f"click target is {expect_hit}", hit == expect_hit, f"hit={hit}")
        send("Input.dispatchMouseEvent", {"type": "mousePressed", "x": x, "y": y, "button": "left", "clickCount": 1})
        time.sleep(0.12)
        send("Input.dispatchMouseEvent", {"type": "mouseReleased", "x": x, "y": y, "button": "left", "clickCount": 1})
        time.sleep(0.7)
        return x, y

    send("Page.enable"); send("Runtime.enable"); send("DOM.enable")
    send("Network.setCacheDisabled", {"cacheDisabled": True})
    send("Page.navigate", {"url": APP})
    t0 = time.time()
    while time.time() - t0 < 25:
        if ev("document.readyState") == "complete" and ev('!!document.querySelector(\'[data-action="begin"]\')'):
            break
        time.sleep(0.5)
    check("build loaded", ev(f'document.documentElement.outerHTML.includes("{APP_VERSION}")'),
          (ev('document.querySelector(\'script[src*="app.js"]\')?.src') or "")[-18:])
    ev('document.querySelector(\'[data-action="begin"]\').click()'); time.sleep(0.5)
    doc = send("DOM.getDocument")["root"]["nodeId"]
    inp = send("DOM.querySelector", {"nodeId": doc, "selector": "#filepicker"})["nodeId"]
    send("DOM.setFileInputFiles", {"nodeId": inp, "files": [JSONL]})
    t0 = time.time()
    while time.time() - t0 < 20:
        if ev('!!document.querySelector(\'[data-action="inspect"]\')'): break
        time.sleep(0.5)
    check("167 lines parsed", ev('document.body.innerText.includes("167")'))
    ev('document.querySelector(\'[data-action="inspect"]\').click()'); time.sleep(1.0)
    nrec = ev('document.querySelectorAll(\'[data-path^="rec:"]\').length')
    check("Inspect shows all 167 record trees", nrec == 167, f"{nrec} record buttons")
    check("record labels present", ev('document.body.innerText.includes("#1")'))
    check("whole-file header", ev('document.body.innerText.includes("whole file")'))

    ev('document.getElementById("dsearch").focus()')
    for ch in "bollyarm":
        send("Input.insertText", {"text": ch}); time.sleep(0.02)
    time.sleep(0.8)
    c1 = counter_text()
    check('counter shows "1 of 14"', c1 == "1 of 14", c1)
    check("marks present", ev('document.querySelectorAll("mark").length') > 0,
          ev('document.querySelectorAll("mark").length'))
    check("current match ring", ev('!!document.getElementById("dmatch-cur")'))
    cur1 = ev('document.getElementById("dmatch-cur").closest("[id^=drec-]").id')

    real_click('[data-action="dsearch-next"]', expect_hit="dsearch-next")
    c2 = counter_text()
    cur2 = ev('document.getElementById("dmatch-cur").closest("[id^=drec-]").id')
    check("down arrow -> 2 of 14, new record", c2 == "2 of 14" and cur2 != cur1, f"{c2} {cur2}")

    ev('document.getElementById("dsearch").scrollIntoView({block:"center"})')
    ev('document.getElementById("dsearch").focus()')
    send("Input.dispatchKeyEvent", {"type": "keyDown", "key": "Enter", "code": "Enter", "windowsVirtualKeyCode": 13, "text": "\r"})
    send("Input.dispatchKeyEvent", {"type": "keyUp", "key": "Enter", "code": "Enter", "windowsVirtualKeyCode": 13})
    time.sleep(0.8)
    c3 = counter_text()
    check("Enter -> 3 of 14", c3 == "3 of 14", c3)

    x, y = real_click('[data-action="dsearch-clear"]', expect_hit="dsearch-clear")
    val = ev('document.getElementById("dsearch").value')
    xgone = ev('!document.querySelector(\'[data-action="dsearch-clear"]\')')
    norec = ev('document.querySelectorAll(\'[data-path^="rec:"]\').length')
    check("REAL X click clears search", val == "" and xgone and norec == 167,
          f"value={val!r} xgone={xgone} recs={norec}")

    ev('document.getElementById("dsearch").focus()')
    for ch in "zzz-no-match":
        send("Input.insertText", {"text": ch}); time.sleep(0.02)
    time.sleep(0.8)
    c4 = counter_text()
    check('no-match -> "0 of 0" + empty state',
          c4 == "0 of 0" and ev('document.body.innerText.includes("No matches for")'), c4)

    ev('document.querySelector(\'[data-action="dsearch-clear"]\').click()'); time.sleep(0.6)
    # the inspected record starts expanded; the 2nd starts collapsed
    first_arrow = ev('document.querySelectorAll(\'[data-path^="rec:"]\')[0].textContent.slice(0,1)')
    check("inspected record starts expanded", first_arrow == "▼", first_arrow)
    ev('document.querySelectorAll(\'[data-path^="rec:"]\')[1].click()'); time.sleep(0.6)
    arrow = ev('document.querySelectorAll(\'[data-path^="rec:"]\')[1].textContent.slice(0,1)')
    check("record expands on tap", arrow == "▼", arrow)

    shot = send("Page.captureScreenshot", {"format": "png"})
    open(SHOT, "wb").write(base64.b64decode(shot["data"]))
    print("screenshot:", SHOT)
    ws.close(); ws = None
finally:
    if ws: ws.close()
    proc.terminate()

fails = [n for n, ok in results if not ok]
print(f"\n{len(results)-len(fails)}/{len(results)} checks passed")
sys.exit(1 if fails else 0)
