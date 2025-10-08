#!/bin/bash

save_patch_dir="./dist/linux-unpacked/patches/"
tmp_dir="/tmp/.silvia_patches"

if [ -d $save_patch_dir ] ; then
        echo "Stashing patches for saving ..."
        if [ ! -d $tmp_dir ] ; then
                mkdir -p $tmp_dir
        fi
        for f in $save_patch_dir/* ; do
                cp -a $f $tmp_dir
        done
fi
