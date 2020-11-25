package main

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"math/rand"
	"net/http"
	"path"
	"sync"
	"time"

	_ "net/http/pprof"

	"github.com/google/uuid"
)

type activeRequest struct {
	RoomId      string `json:"room_id"`
	AdminSecret string `json:"admin_secret"`
	ClientId    string `json:"client_id"`
	Active      bool   `json:"active"`
	Solo        bool   `json:"solo"`
}

type adminRequest struct {
	RoomId      string `json:"room_id"`
	AdminSecret string `json:"admin_secret"`
	ClientId    string `json:"client_id"`
}

type resetRequest struct {
	RoomId      string `json:"room_id"`
	AdminSecret string `json:"admin_secret"`
}

type announceRequest struct {
	RoomId      string `json:"room_id"`
	ClientId    string `json:"client_id"`
	AdminSecret string `json:"admin_secret"`
	Name        string `json:"name"`
}

type controlRequest struct {
	RoomId   string `json:"room_id"`
	ClientId string `json:"client_id"`
	Control  string `json:"control"`
}

type createResponse struct {
	RoomId      string `json:"room_id"`
	AdminSecret string `json:"admin_secret"`
}

type removeRequest struct {
	RoomId   string `json:"room_id"`
	ClientId string `json:"client_id"`
}

type client struct {
	ClientId    string `json:"client_id"`
	Name        string `json:"name"`
	Admin       bool   `json:"admin"`
	Active      bool   `json:"active"`
	ActiveStart int64  `json:"active_start"`

	room      *room
	lastSeen  time.Time
	eventChan chan *event
}

type event struct {
	AdminEvent    *adminEvent    `json:"admin_event"`
	StandardEvent *standardEvent `json:"standard_event"`
}

type adminEvent struct {
	Client *client `json:"client"`
	Remove bool    `json:"remove"`
}

type standardEvent struct {
	Active      bool   `json:"active"`
	ActiveStart int64  `json:"active_start"`
	TimerStart  int64  `json:"timer_start"`
	AdminSecret string `json:"admin_secret"`
}

type controlEvent struct {
	Control string `json:"control"`
}

type room struct {
	roomId     string
	timerStart time.Time
	clientById map[string]*client
	present    map[*presentState]bool
}

type presentState struct {
	responseWriter http.ResponseWriter
	flusher        http.Flusher
	room           *room
	controlChan    chan *controlEvent
}

var key []byte
var roomById = map[string]*room{}
var mu = sync.Mutex{}

func main() {
	rand.Seed(time.Now().UnixNano())

	keyFlag := flag.String("key", "", "secret key")
	bindFlag := flag.String("bind", ":2000", "host:port to listen on")

	flag.Parse()

	if *keyFlag == "" {
		log.Fatalf("please specify --key (suggestion: %x)", rand.Uint64())
	}
	key = []byte(*keyFlag)

	go scanLoop()

	registerFile("/", "index.html")
	registerFile("/remote.js", "remote.js")
	registerFile("/remote.css", "remote.css")

	http.HandleFunc("/api/active", active)
	http.HandleFunc("/api/admin", admin)
	http.HandleFunc("/api/announce", announce)
	http.HandleFunc("/api/control", control)
	http.HandleFunc("/api/create", create)
	http.HandleFunc("/api/present", present)
	http.HandleFunc("/api/remove", remove)
	http.HandleFunc("/api/reset", reset)
	http.HandleFunc("/api/watch", watch)

	server := http.Server{
		Addr: *bindFlag,
	}
	err := server.ListenAndServe()
	if err != nil {
		log.Fatalf("ListenAndServe(): %s", err)
	}
}

func registerFile(urlPath, filename string) {
	http.HandleFunc(urlPath, func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == urlPath {
			serveStatic(w, r, path.Join("static", filename))
		} else {
			w.WriteHeader(404)
		}
	})
}

func serveStatic(resp http.ResponseWriter, req *http.Request, path string) {
	resp.Header().Set("Cache-Control", "public, max-age=3600")
	http.ServeFile(resp, req, path)
}

func scanLoop() {
	ticker := time.NewTicker(5 * time.Second)
	for {
		<-ticker.C
		scan()
	}
}

func scan() {
	mu.Lock()
	defer mu.Unlock()

	grace := 10 * time.Second

	for _, rm := range roomById {
		for _, c := range rm.clientById {
			if time.Now().Sub(c.lastSeen) > grace {
				c.remove()
			}
		}
	}
}

func active(w http.ResponseWriter, r *http.Request) {
	mu.Lock()
	defer mu.Unlock()

	req := &activeRequest{}

	err := json.NewDecoder(r.Body).Decode(req)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	rm := getRoom(req.RoomId)

	if req.AdminSecret != rm.adminSecret() {
		http.Error(w, "invalid admin_secret", http.StatusBadRequest)
		return
	}

	c := rm.clientById[req.ClientId]
	if c == nil {
		http.Error(w, "invalid client_id", http.StatusBadRequest)
		return
	}

	c.Active = req.Active || req.Solo
	if c.Active {
		c.ActiveStart = time.Now().Unix()
	} else {
		c.ActiveStart = 0
	}
	c.update()
	rm.sendAdminEvent(&adminEvent{
		Client: c,
	})

	if req.Solo {
		for _, iter := range rm.clientById {
			if iter == c {
				continue
			}
			if iter.Active {
				iter.Active = false
				iter.ActiveStart = 0
				iter.update()
				rm.sendAdminEvent(&adminEvent{
					Client: iter,
				})
			}
		}
	}
}

func admin(w http.ResponseWriter, r *http.Request) {
	mu.Lock()
	defer mu.Unlock()

	req := &adminRequest{}

	err := json.NewDecoder(r.Body).Decode(req)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	rm := getRoom(req.RoomId)

	if req.AdminSecret != rm.adminSecret() {
		http.Error(w, "invalid admin_secret", http.StatusBadRequest)
		return
	}

	c := rm.clientById[req.ClientId]
	if c == nil {
		http.Error(w, "invalid client_id", http.StatusBadRequest)
		return
	}

	c.Admin = true
	c.update()
	rm.sendAdminEvent(&adminEvent{
		Client: c,
	})
}

func announce(w http.ResponseWriter, r *http.Request) {
	mu.Lock()
	defer mu.Unlock()

	req := &announceRequest{}

	err := json.NewDecoder(r.Body).Decode(req)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	rm := getRoom(req.RoomId)

	admin := false
	if req.AdminSecret != "" {
		if req.AdminSecret == rm.adminSecret() {
			admin = true
		} else {
			http.Error(w, "invalid admin_secret", http.StatusBadRequest)
			return
		}
	}

	c := rm.getClient(req.ClientId)

	changed := false
	if c.Name != req.Name {
		c.Name = req.Name
		changed = true
	}

	if c.Admin != admin {
		c.Admin = admin
		changed = true
	}

	if changed {
		rm.sendAdminEvent(&adminEvent{
			Client: c,
		})
	}
}

func control(w http.ResponseWriter, r *http.Request) {
	mu.Lock()
	defer mu.Unlock()

	req := &controlRequest{}

	err := json.NewDecoder(r.Body).Decode(req)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	rm := getRoom(req.RoomId)
	c := rm.getClient(req.ClientId)

	if !c.Active {
		http.Error(w, "client is not active", http.StatusBadRequest)
		return
	}

	rm.sendControlEvent(&controlEvent{
		Control: req.Control,
	})
}

func create(w http.ResponseWriter, r *http.Request) {
	mu.Lock()
	defer mu.Unlock()

	w.Header().Set("Content-Type", "application/json")

	resp := &createResponse{
		RoomId: uuid.New().String(),
	}

	rm := newRoom(resp.RoomId)
	resp.AdminSecret = rm.adminSecret()

	enc := json.NewEncoder(w)
	err := enc.Encode(resp)
	if err != nil {
		log.Fatal(err)
	}
}

func present(w http.ResponseWriter, r *http.Request) {
	ps := newPresentState(w, r)
	if ps == nil {
		return
	}

	closeChan := w.(http.CloseNotifier).CloseNotify()
	ticker := time.NewTicker(5 * time.Second)

	for {
		select {
		case <-closeChan:
			ps.close()
			return

		case <-ticker.C:
			mu.Lock()
			ps.sendHeartbeat()
			mu.Unlock()

		case ctrl := <-ps.controlChan:
			mu.Lock()
			ps.sendEvent(ctrl)
			mu.Unlock()
		}
	}
}

func remove(w http.ResponseWriter, r *http.Request) {
	mu.Lock()
	defer mu.Unlock()

	req := &removeRequest{}

	err := json.NewDecoder(r.Body).Decode(req)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	rm := getRoom(req.RoomId)
	c := rm.getClient(req.ClientId)
	c.remove()
}

func reset(w http.ResponseWriter, r *http.Request) {
	mu.Lock()
	defer mu.Unlock()

	req := &resetRequest{}

	err := json.NewDecoder(r.Body).Decode(req)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	rm := getRoom(req.RoomId)

	if req.AdminSecret != rm.adminSecret() {
		http.Error(w, "invalid admin_secret", http.StatusBadRequest)
		return
	}

	rm.timerStart = time.Now()
	rm.updateAllClients()
}

func watch(w http.ResponseWriter, r *http.Request) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming unsupported", http.StatusBadRequest)
		return
	}

	client, eventChan := registerWatch(w, r)
	if client == nil {
		return
	}

	closeChan := w.(http.CloseNotifier).CloseNotify()
	ticker := time.NewTicker(5 * time.Second)

	writeInitial(client, w, flusher)

	for {
		select {
		case <-closeChan:
			close(eventChan)

			mu.Lock()
			if client.eventChan == eventChan {
				client.eventChan = nil
			}
			mu.Unlock()

		case <-ticker.C:
			writeHeartbeat(w, flusher)

		case event, ok := <-eventChan:
			if ok {
				writeEvent(event, w, flusher)
			} else {
				return
			}
		}
	}
}

func (c *client) sendEvent(e *event) {
	if c.eventChan != nil {
		c.eventChan <- e
	}
}

func (c *client) remove() {
	if c.eventChan != nil {
		close(c.eventChan)
	}

	delete(c.room.clientById, c.ClientId)

	c.room.sendAdminEvent(&adminEvent{
		Client: c,
		Remove: true,
	})
}

func (c *client) update() {
	e := &event{
		StandardEvent: &standardEvent{
			Active:      c.Active,
			ActiveStart: c.ActiveStart,
			TimerStart:  c.room.timerStart.Unix(),
		},
	}
	if c.Admin {
		e.StandardEvent.AdminSecret = c.room.adminSecret()
	}
	c.sendEvent(e)
}

func newRoom(roomId string) *room {
	return &room{
		roomId:     roomId,
		timerStart: time.Now(),
		clientById: map[string]*client{},
		present:    map[*presentState]bool{},
	}
}

func getRoom(roomId string) *room {
	r := roomById[roomId]
	if r == nil {
		r = newRoom(roomId)
		roomById[roomId] = r
	}
	return r
}

func (rm *room) adminSecret() string {
	h := hmac.New(sha256.New, key)
	return base64.StdEncoding.EncodeToString(h.Sum([]byte(rm.roomId)))
}

func (rm *room) getClient(clientId string) *client {
	c := rm.clientById[clientId]
	if c == nil {
		c = &client{
			ClientId: clientId,
			room:     rm,
		}
		rm.clientById[clientId] = c

		rm.sendAdminEvent(&adminEvent{
			Client: c,
		})
	}

	c.lastSeen = time.Now().UTC()

	return c
}

func (rm *room) sendAdminEvent(ae *adminEvent) {
	for _, client := range rm.clientById {
		if !client.Admin {
			continue
		}
		client.sendEvent(&event{
			AdminEvent: ae,
		})
	}
}

func (rm *room) sendControlEvent(ce *controlEvent) {
	for present, _ := range rm.present {
		present.sendEvent(ce)
	}
}

func (rm *room) updateAllClients() {
	for _, client := range rm.clientById {
		client.update()
	}
}

func registerWatch(w http.ResponseWriter, r *http.Request) (*client, chan *event) {
	mu.Lock()
	defer mu.Unlock()

	roomId := r.URL.Query().Get("room_id")
	room := getRoom(roomId)

	clientId := r.URL.Query().Get("client_id")
	client := room.getClient(clientId)

	adminSecret := r.URL.Query().Get("admin_secret")
	if adminSecret != "" {
		if adminSecret == room.adminSecret() {
			client.Admin = true
		} else {
			http.Error(w, "invalid admin_secret", http.StatusBadRequest)
			return nil, nil
		}
	}

	if client.eventChan != nil {
		close(client.eventChan)
	}

	client.eventChan = make(chan *event, 100)

	client.update()

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")

	// Return eventChan because we're reading it with the lock held
	return client, client.eventChan
}

func writeInitial(client *client, w http.ResponseWriter, flusher http.Flusher) {
	mu.Lock()
	defer mu.Unlock()

	if !client.Admin {
		return
	}

	for _, iter := range client.room.clientById {
		writeEvent(&event{
			AdminEvent: &adminEvent{
				Client: iter,
			},
		}, w, flusher)
	}
}

func writeHeartbeat(w http.ResponseWriter, flusher http.Flusher) {
	writeEvent(&event{}, w, flusher)
}

func writeEvent(e *event, w http.ResponseWriter, flusher http.Flusher) {
	j, err := json.Marshal(e)
	if err != nil {
		log.Fatal(err)
	}
	fmt.Fprintf(w, "data: %s\n\n", j)
	flusher.Flush()
}

func newPresentState(w http.ResponseWriter, r *http.Request) *presentState {
	mu.Lock()
	defer mu.Unlock()

	ps := &presentState{
		responseWriter: w,
		controlChan:    make(chan *controlEvent, 100),
	}

	var ok bool
	ps.flusher, ok = w.(http.Flusher)
	if !ok {
		http.Error(ps.responseWriter, "streaming unsupported", http.StatusBadRequest)
		return nil
	}

	roomId := r.URL.Query().Get("room_id")
	ps.room = getRoom(roomId)

	ps.room.present[ps] = true

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")

	return ps
}

func (ps *presentState) sendHeartbeat() {
	fmt.Fprintf(ps.responseWriter, ":\n\n")
	ps.flusher.Flush()
}

func (ps *presentState) sendEvent(e *controlEvent) {
	j, err := json.Marshal(e)
	if err != nil {
		log.Fatal(err)
	}
	fmt.Fprintf(ps.responseWriter, "data: %s\n\n", j)
	ps.flusher.Flush()
}

func (ps *presentState) close() {
	mu.Lock()
	defer mu.Unlock()

	delete(ps.room.present, ps)
	close(ps.controlChan)
}
