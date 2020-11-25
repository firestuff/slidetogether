"use strict";
const messageBus = new EventTarget();
function main() {
    const url = new URL(location.href);
    if (url.searchParams.has("room")) {
        renderRoom(url.searchParams.get("room"));
    }
    else {
        newRoom();
    }
}
function renderRoom(roomId) {
    const clientId = uuid();
    const adminSecret = localStorage.getItem(`admin_secret:${roomId}`);
    const prnt = document.body;
    const nameLabel = create(prnt, "label", "Name: ");
    const name = create(nameLabel, "input");
    name.type = "text";
    name.size = 30;
    name.value = localStorage.getItem("name") || "";
    name.addEventListener("change", () => {
        localStorage.setItem("name", name.value);
    });
    create(prnt, "a", "[GitHub]", ["github"]).href = "https://github.com/firestuff/slidetogether";
    addEventListener("unload", () => remove(roomId, clientId));
    announce(roomId, clientId, adminSecret, name);
    watch(roomId, clientId, adminSecret, prnt);
}
function newRoom() {
    fetch("api/create", { method: "POST" })
        .then(resp => resp.json())
        .then(data => {
        const resp = data;
        localStorage.setItem(`admin_secret:${resp.room_id}`, resp.admin_secret);
        const url = new URL(location.href);
        url.searchParams.set("room", resp.room_id);
        location.href = url.toString();
    });
}
function announce(roomId, clientId, adminSecret, name) {
    const req = {
        room_id: roomId,
        client_id: clientId,
        admin_secret: adminSecret,
        name: name.value,
    };
    fetch("api/announce", {
        method: "POST",
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(req),
    })
        .then(() => {
        setTimeout(() => announce(roomId, clientId, adminSecret, name), 5000);
    })
        .catch(() => {
        setTimeout(() => announce(roomId, clientId, adminSecret, name), 5000);
    });
}
function watch(roomId, clientId, adminSecret, prnt) {
    const url = new URL("api/watch", location.href);
    url.searchParams.set("room_id", roomId);
    url.searchParams.set("client_id", clientId);
    if (adminSecret) {
        url.searchParams.set("admin_secret", adminSecret);
    }
    createEventSource(url);
    renderControls(roomId, clientId, adminSecret, prnt);
    renderTimers(roomId, adminSecret, prnt);
    if (adminSecret) {
        renderAdmin(roomId, adminSecret, prnt);
    }
}
function createEventSource(url) {
    const es = new EventSource(url.toString());
    es.addEventListener("open", () => {
        messageBus.dispatchEvent(new Event("open"));
    });
    es.addEventListener("message", (e) => {
        messageBus.dispatchEvent(new MessageEvent("message", {
            data: e.data,
            lastEventId: e.lastEventId,
        }));
    });
    es.addEventListener("error", () => {
        console.warn("disconnected");
        es.close();
        setTimeout(() => createEventSource(url), 3000);
        messageBus.dispatchEvent(new Event("error"));
    });
}
function renderControls(roomId, clientId, adminSecret, prnt) {
    const controls = create(prnt, "div", undefined, ["controls"]);
    const left = create(controls, "span", "<<<", ["control-button"]);
    left.addEventListener("click", () => control(roomId, clientId, controls, "left"));
    const right = create(controls, "span", ">>>", ["control-button"]);
    right.addEventListener("click", () => control(roomId, clientId, controls, "right"));
    document.addEventListener("keydown", (e) => {
        switch (e.key) {
            case "ArrowLeft":
                control(roomId, clientId, controls, "left");
                break;
            case " ":
            case "ArrowRight":
                control(roomId, clientId, controls, "right");
                break;
        }
    });
    messageBus.addEventListener("message", (ev) => {
        const e = ev;
        const event = JSON.parse(e.data);
        if (!event.standard_event) {
            return;
        }
        if (event.standard_event.admin_secret && !adminSecret) {
            localStorage.setItem(`admin_secret:${roomId}`, event.standard_event.admin_secret);
            location.reload();
        }
        if (event.standard_event.active) {
            controls.classList.add("enable");
        }
        else {
            controls.classList.remove("enable");
        }
    });
}
function renderTimers(roomId, adminSecret, prnt) {
    let overallStart = null;
    let meStart = null;
    messageBus.addEventListener("message", (ev) => {
        const e = ev;
        const event = JSON.parse(e.data);
        if (!event.standard_event) {
            return;
        }
        overallStart = parseInt(event.standard_event.timer_start || "0", 10) || null;
        meStart = parseInt(event.standard_event.active_start || "0", 10) || null;
    });
    const width = 10;
    const statusDiv = create(prnt, "div", "Status: ".padStart(width, "\u00a0"));
    const status = create(statusDiv, "span");
    messageBus.addEventListener("open", () => {
        status.innerText = "\u{1f7e2}";
    });
    messageBus.addEventListener("error", () => {
        status.innerText = "\u{1f534}";
    });
    const clockDiv = create(prnt, "div", "Clock: ".padStart(width, "\u00a0"));
    const clock = create(clockDiv, "span");
    const overallDiv = create(prnt, "div", "Overall: ".padStart(width, "\u00a0"));
    const overall = create(overallDiv, "span");
    const meDiv = create(prnt, "div", "Me: ".padStart(width, "\u00a0"));
    const me = create(meDiv, "span");
    if (adminSecret) {
        const reset = create(overallDiv, "span", "↺", ["action"]);
        reset.addEventListener("click", () => {
            const req = {
                room_id: roomId,
                admin_secret: adminSecret,
            };
            fetch("api/reset", {
                method: "POST",
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(req),
            });
        });
    }
    setInterval(() => {
        const now = new Date();
        clock.innerText = `${now.getHours().toString().padStart(2, "0")}h${now.getMinutes().toString().padStart(2, "0")}m${now.getSeconds().toString().padStart(2, "0")}s`;
        if (overallStart) {
            const o = Math.trunc(now.getTime() / 1000 - overallStart);
            overall.innerText = `${Math.trunc(o / 3600).toString().padStart(2, "0")}h${Math.trunc(o % 3600 / 60).toString().padStart(2, "0")}m${Math.trunc(o % 60).toString().padStart(2, "0")}s`;
        }
        else {
            overall.innerText = "";
        }
        if (meStart) {
            const d = Math.trunc(now.getTime() / 1000 - meStart);
            me.innerText = `${Math.trunc(d / 3600).toString().padStart(2, "0")}h${Math.trunc(d % 3600 / 60).toString().padStart(2, "0")}m${Math.trunc(d % 60).toString().padStart(2, "0")}s`;
        }
        else {
            me.innerText = "";
        }
    }, 250);
}
function renderAdmin(roomId, adminSecret, prnt) {
    const table = create(prnt, "table", undefined, ["users"]);
    const head = create(table, "thead");
    const head1 = create(head, "tr");
    create(head1, "th", "Name");
    create(head1, "th", "Active Time");
    create(head1, "th", "👑");
    create(head1, "th", "👆");
    create(head1, "th", "🌟");
    const body = create(table, "tbody");
    const rows = new Map();
    messageBus.addEventListener("open", () => {
        rows.clear();
        body.innerHTML = "";
    });
    messageBus.addEventListener("message", (ev) => {
        const e = ev;
        const event = JSON.parse(e.data);
        if (!event.admin_event) {
            return;
        }
        const client = event.admin_event.client;
        let row = rows.get(client.client_id);
        if (row) {
            row.remove();
            rows.delete(client.client_id);
        }
        if (event.admin_event.remove) {
            return;
        }
        row = document.createElement("tr");
        row.dataset.name = client.name;
        row.dataset.active = client.active ? "active" : "";
        row.dataset.activeStart = client.active_start;
        let before = null;
        for (const iter of body.children) {
            const iterRow = iter;
            if (iterRow.dataset.name.localeCompare(row.dataset.name) > 0) {
                before = iter;
                break;
            }
        }
        body.insertBefore(row, before);
        create(row, "td", client.name);
        create(row, "td");
        const adminCell = create(row, "td", "👑", client.admin ? ["admin", "enable"] : ["admin"]);
        adminCell.addEventListener("click", () => {
            if (!client.admin) {
                if (!confirm(`Grant admin access to ${client.name}?`)) {
                    return;
                }
                admin(roomId, adminSecret, client.client_id);
            }
        });
        const activeCell = create(row, "td", "👆", client.active ? ["active", "enable"] : ["active"]);
        activeCell.addEventListener("click", () => {
            active(roomId, adminSecret, client.client_id, !activeCell.classList.contains("enable"), false);
        });
        const soloCell = create(row, "td", "🌟", ["solo"]);
        soloCell.addEventListener("click", () => {
            if (soloCell.classList.contains("enable")) {
                active(roomId, adminSecret, client.client_id, false, false);
            }
            else {
                active(roomId, adminSecret, client.client_id, true, true);
            }
        });
        rows.set(client.client_id, row);
        setSolo(rows);
    });
    setInterval(() => {
        const now = new Date();
        for (const row of rows.values()) {
            const cell = row.children[1];
            const as = parseInt(row.dataset.activeStart || "0", 10) || null;
            if (as) {
                const d = Math.trunc(now.getTime() / 1000 - as);
                cell.innerText = `${Math.trunc(d / 3600).toString().padStart(2, "0")}h${Math.trunc(d % 3600 / 60).toString().padStart(2, "0")}m${Math.trunc(d % 60).toString().padStart(2, "0")}s`;
            }
        }
    }, 250);
}
function setSolo(rows) {
    let activeCount = 0;
    for (const row of rows.values()) {
        if (row.dataset.active === "active") {
            activeCount++;
        }
    }
    for (const row of rows.values()) {
        if (activeCount === 1 && row.dataset.active === "active") {
            row.children[4].classList.add("enable");
        }
        else {
            row.children[4].classList.remove("enable");
        }
    }
}
function active(roomId, adminSecret, clientId, val, solo) {
    const req = {
        room_id: roomId,
        admin_secret: adminSecret,
        client_id: clientId,
        active: val,
        solo,
    };
    fetch("api/active", {
        method: "POST",
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(req),
    });
}
function admin(roomId, adminSecret, clientId) {
    const req = {
        room_id: roomId,
        admin_secret: adminSecret,
        client_id: clientId,
    };
    fetch("api/admin", {
        method: "POST",
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(req),
    });
}
function control(roomId, clientId, controls, ctrl) {
    if (!controls.classList.contains("enable")) {
        return;
    }
    const req = {
        room_id: roomId,
        client_id: clientId,
        control: ctrl,
    };
    fetch("api/control", {
        method: "POST",
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(req),
    });
}
function create(prnt, tag, text, classes) {
    const elem = document.createElement(tag);
    prnt.appendChild(elem);
    if (text) {
        elem.innerText = text;
    }
    for (const cls of classes !== null && classes !== void 0 ? classes : []) {
        elem.classList.add(cls);
    }
    return elem;
}
function remove(roomId, clientId) {
    const req = {
        room_id: roomId,
        client_id: clientId,
    };
    navigator.sendBeacon("api/remove", JSON.stringify(req));
}
function uuid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}
if (document.readyState === "loading") {
    addEventListener("DOMContentLoaded", () => main());
}
else {
    main();
}
