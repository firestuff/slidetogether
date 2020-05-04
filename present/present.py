#!/usr/bin/env python3

# To install dependencies:
# pip3 install requests sseclient pyautogui

import json
import pyautogui
import requests
import sseclient
import sys
import time
import urllib

ALLOWED_CONTROLS = {'left', 'right'}

if len(sys.argv) != 2:
    print(f'usage: {sys.argv[0]} <url>')
    sys.exit(1)

url = urllib.parse.urlparse(sys.argv[1])
qs = urllib.parse.parse_qs(url.query)

if 'room' not in qs or len(qs['room']) != 1:
    print(f'invalid url: {sys.argv[1]}')

room = qs['room'][0]

presentUrl = urllib.parse.urlunparse([
    url.scheme,
    url.netloc,
    '/api/present',
    url.params,
    urllib.parse.urlencode({'room_id': room}),
    url.fragment,
])

while True:
    try:
        response = requests.get(presentUrl, stream=True)
        client = sseclient.SSEClient(response)
        for event in client.events():
            parsed = json.loads(event.data)
            control = parsed['control']
            if control not in ALLOWED_CONTROLS:
                print(f'INVALID CONTROL: {control}')
                continue
            print(control)
            pyautogui.press(control)
    except Exception as e:
        print(e)
        time.sleep(2)
