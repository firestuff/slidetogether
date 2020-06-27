"use strict";
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
    fetch("/api/create", { method: "POST" })
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
    fetch("/api/announce", {
        method: "POST",
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(req),
    })
        .then(() => {
        setTimeout(() => announce(roomId, clientId, adminSecret, name), 5000);
    });
}
function watch(roomId, clientId, adminSecret, prnt) {
    const url = new URL("/api/watch", location.href);
    url.searchParams.set("room_id", roomId);
    url.searchParams.set("client_id", clientId);
    if (adminSecret) {
        url.searchParams.set("admin_secret", adminSecret);
    }
    const es = new EventSource(url.toString());
    renderControls(roomId, clientId, adminSecret, prnt, es);
    if (adminSecret) {
        renderAdmin(roomId, adminSecret, prnt, es);
    }
}
function renderControls(roomId, clientId, adminSecret, prnt, es) {
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
    es.addEventListener("message", (e) => {
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
    const clockDiv = create(prnt, "div", "\u00a0Time: ");
    const clock = create(clockDiv, "span");
    setInterval(() => {
        const now = new Date();
        clock.innerText = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}:${now.getSeconds().toString().padStart(2, "0")}`;
    }, 250);
}
function renderAdmin(roomId, adminSecret, prnt, es) {
    const table = create(prnt, "table", undefined, ["users"]);
    const head = create(table, "thead");
    const head1 = create(head, "tr");
    create(head1, "th", "Name");
    create(head1, "th", "👑");
    create(head1, "th", "👆");
    const body = create(table, "tbody");
    const rows = new Map();
    es.addEventListener("message", (e) => {
        const event = JSON.parse(e.data);
        if (!event.admin_event) {
            return;
        }
        const client = event.admin_event.client;
        let row = rows.get(client.public_client_id);
        if (row) {
            row.remove();
            rows.delete(client.public_client_id);
        }
        if (event.admin_event.remove) {
            return;
        }
        row = document.createElement("tr");
        row.dataset.name = client.name;
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
        const adminCell = create(row, "td", "👑", client.admin ? ["admin", "enable"] : ["admin"]);
        adminCell.addEventListener("click", () => {
            if (!client.admin) {
                if (!confirm(`Grant admin access to ${client.name}?`)) {
                    return;
                }
                admin(roomId, adminSecret, client.public_client_id);
            }
        });
        const activeCell = create(row, "td", "👆", client.active ? ["active", "enable"] : ["active"]);
        activeCell.addEventListener("click", () => {
            active(roomId, adminSecret, client.public_client_id, !activeCell.classList.contains("enable"));
        });
        rows.set(client.public_client_id, row);
    });
}
function active(roomId, adminSecret, publicClientId, val) {
    const req = {
        room_id: roomId,
        admin_secret: adminSecret,
        public_client_id: publicClientId,
        active: val,
    };
    fetch("/api/active", {
        method: "POST",
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(req),
    });
}
function admin(roomId, adminSecret, publicClientId) {
    const req = {
        room_id: roomId,
        admin_secret: adminSecret,
        public_client_id: publicClientId,
    };
    fetch("/api/admin", {
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
    fetch("/api/control", {
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
    navigator.sendBeacon("/api/remove", JSON.stringify(req));
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
