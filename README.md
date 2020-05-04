## No more "Next Slide Please"

[slidetogether.io](https://slidetogether.io/) is a service for controlling a single presentation from multiple remote computers. Think of is as a presentation remote that works across the Internet.

The presentation computer runs a [Python client](present/present.py) which injects keystrokes. It is limited to standard presentation remote keystrokes (left & right arrows) to minimize security issues.

Remote presenters send commands from a web browser. One or more administrators control which presenters can send commands at any time.

SlideTogether is divided into "rooms". Rooms are entirely separate, with different presentation computers, presenters, and administrators. When you visit [slidetogether.io](https://slidetogether.io/), you are redirected into a new room. You can copy & paste the URL into meeting invites. The first person in the room is an administrator; all others default to optional presenters who have to be enabled by the administrator.
