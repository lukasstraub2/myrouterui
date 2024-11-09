# Myrouterui web interface

Author: Lukas Straub <lukasstraub2@web.de>

Myrouterui is a simple web interface to toggle nftables rules.

Myrouterui enhances security through privilege separation. It utilizes a privileged child process to update nftables rules, while the http server process runs with reduced privileges. This architecture ensures that even if the server process is compromised, the attacker gains no further privileges.

## Installation

First create a tar archive:

```
cd myrouterui
git archive --format=tar.gz --prefix=myrouterui/ --output=myrouterui.tar.gz master
```

Copy the tar archive to the router and do:

```
sudo apt-get install nftables nodejs
cd /opt
sudo tar -xzf /<path-to>/myrouterui.tar.gz
sudo cp myrouterui/myrouterui.service /etc/systemd/system
sudo systemctl daemon-reload
sudo systemctl enable --now myrouterui
```