## No More "Next Slide Please"

[slidetogether.io](https://slidetogether.io/) is a service for controlling a single presentation from multiple remote computers. Think of is as a presentation remote that works across the Internet.

Each presentation computer runs a [Python client](present/present.py) which injects keystrokes. It is limited to standard presentation remote keystrokes (left & right arrows) to minimize security issues.

Remote presenters send commands from a web browser. One or more administrators control which presenters can send commands at any time.

SlideTogether is divided into "rooms". Rooms are entirely separate, with different presentation computers, presenters, and administrators. When you visit [slidetogether.io](https://slidetogether.io/), you are redirected into a new room. You can copy & paste the URL into meeting invites. The first person in the room is an administrator; all others default to optional presenters who have to be enabled by the administrator.

## Installation

Installation is *only required on the computer that will be sharing its screen*. Users who are pressing keys to control the presentation and administrators who are selecting who can control the presentation do so via web browsers.

### MacOS Pre-Installation

Do this first if you're running MacOS.

* Install [homebrew](https://brew.sh/)
* ```brew install python3```

Then continue below.

### All Platform Installation

* ```sudo pip3 install --upgrade pip```
* ```sudo pip3 install --upgrade requests sseclient-py pyautogui```
* ```git clone https://github.com/firestuff/slidetogether.git```

## Use

* Administrator: Go to [slidetogether.io](https://slidetogether.io/) to generate a new room
* Screen sharer: ```slidetogether/present/present.py 'FULL_ROOM_URL_HERE'```
* Screen sharer: Share as normal with your normal video conferencing software. Ensure that left/right arrows move the presentation locally.
* Presentation controllers: Go to the room URL in a web browser and enter your name in the top box
* Administrator: Enable users when it is their turn to present
* Presentation controllers: Click the buttons or use left/right arrow to move the slides
