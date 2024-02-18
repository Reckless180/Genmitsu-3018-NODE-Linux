#!/bin/bash
. ~/.bashrc
. ~/.nvm/nvm.sh
nvm use 'v12.19.0'
cd /home/matt/work/node/Genmitsu-3018-NODE-Linux/easel-driver/easel-driver

echo "Starting easel-driver"
node iris.js
