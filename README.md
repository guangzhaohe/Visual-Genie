<div align="center">
<h1>🧞 Visual Genie</h1>
</div>

## Overview

<div align="center">
    <img width=80% src=assets/teaser.png>
    </img>
</div>
A React-based file visualizer that supports common 3D models, text files, images/videos and more.

## Todo

- [ ] Add full supported extension list.
- [x] Add teaser.
- [x] Add quick start and what if port collide.

## Quick Start

`Remote` → Machine you want to visualize on.\
`Local` → Machine you want to see the visualization, could be the same as Remote.

1. `Remote` Clone this repo to the machine that you want to visualize.
```bash
git clone git@github.com:guangzhaohe/Visual-Genie.git
```

2. `Remote` Install python requirements.
```bash
pip install -r requirements.txt
```

3. `Remote` Run server.
```bash
python app.py
```

4. `Remote` Forward server port to local machine via SSH.
```bash
ssh -L LOCAL_PORT:localhost:REMOTE_HOST USER@SSH_HOST 
```
For example,
```bash
ssh -L 8000:localhost:8000 abc123@node-01      
```

5. `Local` Open your local browser and go to the forwarded port, possibly something like `localhost:8000` (if the remote port was forwarded to local `:8000` port).

6. `Local` (Optional) If the forwarded port was not `:8000`, go to the settings menu on the website, and change port accordingly.
