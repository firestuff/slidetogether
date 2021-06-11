#!/usr/bin/env python3

# To install dependencies:
# pip3 install requests sseclient-py pyautogui

import argparse
import json
import requests
import sseclient
import time
import urllib

ALLOWED_CONTROLS = {'left', 'right'}

parser = argparse.ArgumentParser(description='slidetogether.io presenter client')
parser.add_argument('url')
parser.add_argument('--keynote', action='store_true')
args = parser.parse_args()

url = urllib.parse.urlparse(args.url)
qs = urllib.parse.parse_qs(url.query)

if 'room' not in qs or len(qs['room']) != 1:
    print(f'invalid url: {args.url}')

room = qs['room'][0]

presentUrl = urllib.parse.urlunparse([
    url.scheme,
    url.netloc,
    url.path + 'api/present',
    url.params,
    urllib.parse.urlencode({'room_id': room}),
    url.fragment,
])

if args.keynote:
    import subprocess
    LOOKUP = {
        'left': 'show previous',
        'right': 'show next',
    }
    def send_key(key):
        subprocess.run([
            'osascript',
            '-e', 'tell application "Keynote"',
            '-e', LOOKUP[key],
            '-e', 'end tell',
        ])
else:
    import pyautogui
    pyautogui.FAILSAFE = False
    def send_key(key):
        pyautogui.press(control)

while True:
    try:
        response = requests.get(presentUrl, stream=True)
        client = sseclient.SSEClient(response)
        for event in client.events():
            parsed = json.loads(event.data)
            control = parsed['control']
            if control == '':
                continue
            if control not in ALLOWED_CONTROLS:
                print(f'INVALID CONTROL: {control}')
                continue
            print(control)
            send_key(control)
    except Exception as e:
        print(e)
        time.sleep(2)
