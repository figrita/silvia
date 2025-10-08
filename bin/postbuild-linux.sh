#!/bin/bash

save_patch_dir="./dist/linux-unpacked/patches/"
tmp_dir="/tmp/.silvia_patches"

if [ -d $tmp_dir ] ; then
        echo "Restoring patches ..."
        mkdir -p $save_patch_dir
        for f in $tmp_dir/* ; do
                cp -a $f $save_patch_dir
        done
fi

rm -rf $tmp_dir
