/**
 * Default patches for Silvia
 * These are loaded dynamically to avoid blocking the initial app load
 */

export const defaultPatches = [
    {
        "nodes": [
            {
                "id": 77,
                "slug": "checkerboard",
                "x": 477,
                "y": 512,
                "controls": {
                    "frequency": 4,
                    "color1": "#ffffffff",
                    "color2": "#000000ff"
                }
            },
            {
                "id": 78,
                "slug": "edgedetection",
                "x": 1153,
                "y": 418,
                "controls": {
                    "strength": 0.3,
                    "sampleDistance": 0.002,
                    "invert": 0
                },
                "optionValues": {
                    "mode": "sobel"
                },
                "controlRanges": {
                    "sampleDistance": {
                        "min": 0.001,
                        "max": 5
                    }
                }
            },
            {
                "id": 79,
                "slug": "output",
                "x": 1444,
                "y": 13,
                "controls": {
                    "showA": "",
                    "showB": "",
                    "snap": "",
                    "rec": ""
                },
                "optionValues": {
                    "resolution": "1280x720",
                    "recordDuration": "manual"
                },
                "values": {
                    "frameHistorySize": 10
                }
            },
            {
                "id": 80,
                "slug": "checkerboard",
                "x": 883,
                "y": 151,
                "controls": {
                    "frequency": 4,
                    "color1": "#ffffffff",
                    "color2": "#000000ff"
                }
            },
            {
                "id": 81,
                "slug": "rotate",
                "x": 1142,
                "y": 166,
                "controls": {
                    "angle": 0.25
                }
            },
            {
                "id": 82,
                "slug": "animation",
                "x": 468,
                "y": 25,
                "controls": {
                    "startStop": "",
                    "restart": ""
                },
                "optionValues": {
                    "approach_curve": "smooth",
                    "return_curve": "smooth"
                },
                "values": {
                    "startValue": 2,
                    "endValue": 12,
                    "duration": 4.39,
                    "isRunning": true
                }
            },
            {
                "id": 83,
                "slug": "feedback",
                "x": 22,
                "y": 64,
                "controls": {}
            },
            {
                "id": 84,
                "slug": "fisheye",
                "x": 223,
                "y": 14,
                "controls": {
                    "distortion": 1,
                    "radius": 1,
                    "centerX": 0,
                    "centerY": 0
                }
            },
            {
                "id": 86,
                "slug": "rotate",
                "x": 854,
                "y": 525,
                "controls": {
                    "angle": 0
                }
            },
            {
                "id": 87,
                "slug": "oscillator",
                "x": 15,
                "y": 302,
                "controls": {
                    "startStop": "",
                    "reset": ""
                },
                "optionValues": {
                    "waveform": "sawtooth",
                    "mode": "free"
                },
                "values": {
                    "frequency": 0.01,
                    "amplitude": 2,
                    "offset": 0,
                    "isRunning": true
                }
            }
        ],
        "connections": [
            {
                "fromNode": 80,
                "fromPort": "output",
                "toNode": 81,
                "toPort": "input"
            },
            {
                "fromNode": 81,
                "fromPort": "output",
                "toNode": 77,
                "toPort": "color1"
            },
            {
                "fromNode": 82,
                "fromPort": "output",
                "toNode": 80,
                "toPort": "frequency"
            },
            {
                "fromNode": 83,
                "fromPort": "output",
                "toNode": 84,
                "toPort": "input"
            },
            {
                "fromNode": 84,
                "fromPort": "output",
                "toNode": 77,
                "toPort": "color2"
            },
            {
                "fromNode": 87,
                "fromPort": "output",
                "toNode": 86,
                "toPort": "angle"
            },
            {
                "fromNode": 77,
                "fromPort": "output",
                "toNode": 86,
                "toPort": "input"
            },
            {
                "fromNode": 86,
                "fromPort": "output",
                "toNode": 78,
                "toPort": "input"
            },
            {
                "fromNode": 78,
                "fromPort": "output",
                "toNode": 79,
                "toPort": "input"
            },
            {
                "fromNode": 84,
                "fromPort": "output",
                "toNode": 80,
                "toPort": "color2"
            }
        ],
        "editorWidth": 1980,
        "meta": {
            "name": "Difference Engine",
            "author": "figrita",
            "description": "Fun with feedback and edge detection, color left as an exercise",
            "thumbnail": "data:image/jpeg;base64,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"
        },
        "version": "0.2"
    },
    {
        "nodes": [
            {
                "id": 186,
                "slug": "output",
                "x": 2985,
                "y": 56,
                "controls": {
                    "showA": "",
                    "showB": "",
                    "snap": "",
                    "rec": ""
                },
                "optionValues": {
                    "resolution": "1280x720",
                    "recordDuration": "manual"
                },
                "values": {
                    "frameHistorySize": 10
                }
            },
            {
                "id": 187,
                "slug": "color",
                "x": 671,
                "y": 1,
                "controls": {
                    "color": "#c24646ff"
                }
            },
            {
                "id": 188,
                "slug": "multiply",
                "x": 510,
                "y": 82,
                "controls": {
                    "input": 1,
                    "gain": 1
                }
            },
            {
                "id": 189,
                "slug": "multiply",
                "x": 508,
                "y": 343,
                "controls": {
                    "input": 1,
                    "gain": 1
                }
            },
            {
                "id": 190,
                "slug": "color",
                "x": 683,
                "y": 293,
                "controls": {
                    "color": "#589ecbff"
                }
            },
            {
                "id": 191,
                "slug": "layerblend",
                "x": 1408,
                "y": 98,
                "controls": {
                    "background": "#000000ff",
                    "foreground": "#ffffffff",
                    "opacity": 1
                },
                "optionValues": {
                    "blend_mode": "normal"
                }
            },
            {
                "id": 192,
                "slug": "multiply",
                "x": 508,
                "y": 656,
                "controls": {
                    "input": 1,
                    "gain": 1
                }
            },
            {
                "id": 193,
                "slug": "color",
                "x": 669,
                "y": 616,
                "controls": {
                    "color": "#edd400ff"
                }
            },
            {
                "id": 194,
                "slug": "layerblend",
                "x": 1459,
                "y": 371,
                "controls": {
                    "background": "#000000ff",
                    "foreground": "#ffffffff",
                    "opacity": 1
                },
                "optionValues": {
                    "blend_mode": "normal"
                }
            },
            {
                "id": 196,
                "slug": "circle",
                "x": 915,
                "y": 23,
                "controls": {
                    "foreground": "#ffffffff",
                    "background": "#00000000",
                    "radius": 0.5,
                    "softness": 0.01,
                    "centerX": 0,
                    "centerY": 0
                }
            },
            {
                "id": 197,
                "slug": "circle",
                "x": 912,
                "y": 320,
                "controls": {
                    "foreground": "#ffffffff",
                    "background": "#00000000",
                    "radius": 0.5,
                    "softness": 0.01,
                    "centerX": 0,
                    "centerY": 0
                }
            },
            {
                "id": 198,
                "slug": "circle",
                "x": 912,
                "y": 627,
                "controls": {
                    "foreground": "#ffffffff",
                    "background": "#00000000",
                    "radius": 0.5,
                    "softness": 0.01,
                    "centerX": 0,
                    "centerY": 0
                }
            },
            {
                "id": 199,
                "slug": "translate",
                "x": 1164,
                "y": 118,
                "controls": {
                    "x": -1,
                    "y": 0
                }
            },
            {
                "id": 200,
                "slug": "translate",
                "x": 1161,
                "y": 315,
                "controls": {
                    "x": 0,
                    "y": 0
                }
            },
            {
                "id": 201,
                "slug": "translate",
                "x": 1167,
                "y": 552,
                "controls": {
                    "x": 1,
                    "y": 0
                }
            },
            {
                "id": 202,
                "slug": "shakycam",
                "x": 2133,
                "y": 57,
                "controls": {
                    "xSpeed": 1,
                    "ySpeed": 1,
                    "sinCoeff": 1,
                    "cosCoeff": 1,
                    "amplitude": 0.1
                }
            },
            {
                "id": 203,
                "slug": "tile",
                "x": 1774,
                "y": 117,
                "controls": {
                    "width": 2,
                    "height": 2,
                    "span": 1,
                    "offsetX": 0,
                    "offsetY": 0,
                    "slide": 0
                },
                "optionValues": {
                    "slideDirection": "horizontal"
                }
            },
            {
                "id": 204,
                "slug": "halftone",
                "x": 2419,
                "y": 84,
                "controls": {
                    "dotSize": 2,
                    "angle": 4,
                    "smoothness": 0.25
                },
                "optionValues": {
                    "mode": "rgb"
                }
            },
            {
                "id": 205,
                "slug": "grid",
                "x": 2668,
                "y": 392,
                "controls": {
                    "foreground": "#ffffffff",
                    "background": "#000000ff",
                    "cellsX": 10,
                    "cellsY": 10,
                    "thickness": 0.05,
                    "offsetX": -0.1,
                    "offsetY": 0,
                    "smoothing": 0.01
                },
                "optionValues": {
                    "mode": "lines"
                }
            },
            {
                "id": 206,
                "slug": "layerblend",
                "x": 2677,
                "y": 115,
                "controls": {
                    "background": "#000000ff",
                    "foreground": "#ffffffff",
                    "opacity": 1
                },
                "optionValues": {
                    "blend_mode": "normal"
                }
            },
            {
                "id": 207,
                "slug": "animation",
                "x": 2302,
                "y": 409,
                "controls": {
                    "startStop": "",
                    "restart": ""
                },
                "optionValues": {
                    "approach_curve": "smooth",
                    "return_curve": "smooth",
                    "loop_mode": "loop",
                    "tween": "easeInOutSine"
                },
                "values": {
                    "startValue": 0,
                    "endValue": -0.1,
                    "duration": 1,
                    "isRunning": false
                }
            },
            {
                "id": 208,
                "slug": "micline",
                "x": 54,
                "y": 175,
                "controls": {},
                "values": {
                    "volume": 1,
                    "smoothing": 0.7,
                    "gain": 1,
                    "thresholds": {
                        "bass": 1,
                        "bassExciter": 1,
                        "mid": 1,
                        "high": 1,
                        "volume": 1
                    },
                    "debounceMs": 100,
                    "selectedDeviceId": "6c3a43435ad6c192d80e1c826ef125d0d79eae4629c87a5520a639be53c84082",
                    "audioVisibility": {
                        "numbers": true,
                        "events": false
                    }
                }
            }
        ],
        "connections": [
            {
                "fromNode": 187,
                "fromPort": "output",
                "toNode": 196,
                "toPort": "foreground"
            },
            {
                "fromNode": 188,
                "fromPort": "output",
                "toNode": 196,
                "toPort": "radius"
            },
            {
                "fromNode": 190,
                "fromPort": "output",
                "toNode": 197,
                "toPort": "foreground"
            },
            {
                "fromNode": 189,
                "fromPort": "output",
                "toNode": 197,
                "toPort": "radius"
            },
            {
                "fromNode": 193,
                "fromPort": "output",
                "toNode": 198,
                "toPort": "foreground"
            },
            {
                "fromNode": 192,
                "fromPort": "output",
                "toNode": 198,
                "toPort": "radius"
            },
            {
                "fromNode": 196,
                "fromPort": "color",
                "toNode": 199,
                "toPort": "input"
            },
            {
                "fromNode": 199,
                "fromPort": "output",
                "toNode": 191,
                "toPort": "background"
            },
            {
                "fromNode": 197,
                "fromPort": "color",
                "toNode": 200,
                "toPort": "input"
            },
            {
                "fromNode": 200,
                "fromPort": "output",
                "toNode": 191,
                "toPort": "foreground"
            },
            {
                "fromNode": 198,
                "fromPort": "color",
                "toNode": 201,
                "toPort": "input"
            },
            {
                "fromNode": 201,
                "fromPort": "output",
                "toNode": 194,
                "toPort": "foreground"
            },
            {
                "fromNode": 191,
                "fromPort": "output",
                "toNode": 194,
                "toPort": "background"
            },
            {
                "fromNode": 194,
                "fromPort": "output",
                "toNode": 203,
                "toPort": "input"
            },
            {
                "fromNode": 203,
                "fromPort": "output",
                "toNode": 202,
                "toPort": "input"
            },
            {
                "fromNode": 202,
                "fromPort": "output",
                "toNode": 204,
                "toPort": "input"
            },
            {
                "fromNode": 205,
                "fromPort": "color",
                "toNode": 206,
                "toPort": "background"
            },
            {
                "fromNode": 204,
                "fromPort": "output",
                "toNode": 206,
                "toPort": "foreground"
            },
            {
                "fromNode": 207,
                "fromPort": "output",
                "toNode": 205,
                "toPort": "offsetX"
            },
            {
                "fromNode": 206,
                "fromPort": "output",
                "toNode": 186,
                "toPort": "input"
            },
            {
                "fromNode": 208,
                "fromPort": "bassExciter",
                "toNode": 188,
                "toPort": "input"
            },
            {
                "fromNode": 208,
                "fromPort": "mid",
                "toNode": 189,
                "toPort": "input"
            },
            {
                "fromNode": 208,
                "fromPort": "high",
                "toNode": 192,
                "toPort": "input"
            }
        ],
        "editorWidth": 3374,
        "meta": {
            "name": "HalftoneDots",
            "author": "Cheshire",
            "description": "A music visualizer",
            "thumbnail": "data:image/jpeg;base64,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",
            "savedAt": "2025-09-21T03:34:21.031Z"
        },
        "version": "0.1"
    },
    {
        "nodes": [
            {
                "id": 93,
                "slug": "output",
                "x": 2949,
                "y": 64,
                "controls": {
                    "showA": "",
                    "showB": "",
                    "snap": "",
                    "rec": ""
                },
                "optionValues": {
                    "resolution": "1280x720",
                    "recordDuration": "manual"
                },
                "values": {
                    "frameHistorySize": 10
                }
            },
            {
                "id": 94,
                "slug": "mosaic",
                "x": 110,
                "y": 78,
                "controls": {
                    "cellSize": 11.5,
                    "randomness": 1,
                    "borderWidth": 0.1,
                    "borderColor": "#ffffffff",
                    "smoothing": 0.02
                },
                "optionValues": {
                    "shape": "voronoi"
                }
            },
            {
                "id": 95,
                "slug": "tunnel",
                "x": 475,
                "y": 95,
                "controls": {
                    "distance": 0.8,
                    "speed": 0.5,
                    "rotation": 0
                }
            },
            {
                "id": 96,
                "slug": "invert",
                "x": 731,
                "y": 134,
                "controls": {
                    "mix": 1
                }
            },
            {
                "id": 97,
                "slug": "spiral",
                "x": 413,
                "y": 352,
                "controls": {
                    "foreground": "#ffffffff",
                    "background": "#000000ff",
                    "turns": 4.1,
                    "thickness": 0.2,
                    "innerRadius": 0,
                    "outerRadius": 1.5,
                    "rotation": 0
                },
                "optionValues": {
                    "type": "archimedean"
                }
            },
            {
                "id": 98,
                "slug": "perspective",
                "x": 1200,
                "y": 96,
                "controls": {
                    "tiltX": 0,
                    "tiltY": 0.55
                }
            },
            {
                "id": 99,
                "slug": "tile",
                "x": 1403,
                "y": 79,
                "controls": {
                    "width": 1.2,
                    "height": 1.2,
                    "span": 1,
                    "offsetX": 0,
                    "offsetY": 0,
                    "slide": 0
                },
                "optionValues": {
                    "slideDirection": "vertical"
                }
            },
            {
                "id": 100,
                "slug": "kaleidoscope",
                "x": 1816,
                "y": 108,
                "controls": {
                    "segments": 4,
                    "offset": 0,
                    "twist": -0.15,
                    "zoom": 1,
                    "sourceSegment": 2
                },
                "optionValues": {
                    "style": "continuous"
                },
                "controlRanges": {
                    "sourceSegment": {
                        "min": 1,
                        "max": 4
                    }
                }
            },
            {
                "id": 101,
                "slug": "animation",
                "x": 1068,
                "y": 462,
                "controls": {
                    "startStop": "",
                    "restart": ""
                },
                "optionValues": {
                    "approach_curve": "smooth",
                    "return_curve": "smooth"
                },
                "values": {
                    "startValue": -0.5,
                    "endValue": 0.5,
                    "duration": 2,
                    "isRunning": true
                }
            },
            {
                "id": 102,
                "slug": "tunnel",
                "x": 2163,
                "y": 110,
                "controls": {
                    "distance": 0.9,
                    "speed": 0.5,
                    "rotation": 0
                }
            },
            {
                "id": 103,
                "slug": "contrast",
                "x": 2667,
                "y": 123,
                "controls": {
                    "contrast": 1.99,
                    "brightness": -0.01
                }
            },
            {
                "id": 104,
                "slug": "polygon",
                "x": 2121,
                "y": 460,
                "controls": {
                    "foreground": "#ffffffff",
                    "background": "#000000ff",
                    "sides": 4,
                    "radius": 1.1,
                    "rotation": 0,
                    "softness": 0.01
                }
            },
            {
                "id": 105,
                "slug": "whirlandpinch",
                "x": 955,
                "y": 98,
                "controls": {
                    "whirl": 4,
                    "pinch": 0,
                    "radius": 0.5
                }
            },
            {
                "id": 106,
                "slug": "reframerange",
                "x": 736,
                "y": 383,
                "controls": {
                    "input": 0.5,
                    "inMin": 0,
                    "inMax": 1,
                    "outMin": 0.5,
                    "outMax": 1.5
                },
                "optionValues": {
                    "clamp": "off"
                }
            },
            {
                "id": 107,
                "slug": "reframerange",
                "x": 2360,
                "y": 355,
                "controls": {
                    "input": 0.5,
                    "inMin": 0,
                    "inMax": 1,
                    "outMin": 1,
                    "outMax": 5
                },
                "optionValues": {
                    "clamp": "off"
                }
            },
            {
                "id": 108,
                "slug": "reframerange",
                "x": 2597,
                "y": 567,
                "controls": {
                    "input": 0.5,
                    "inMin": 0,
                    "inMax": 1,
                    "outMin": 0.2,
                    "outMax": 0
                },
                "optionValues": {
                    "clamp": "off"
                }
            },
            {
                "id": 109,
                "slug": "micline",
                "x": 1772,
                "y": 453,
                "controls": {},
                "values": {
                    "volume": 1,
                    "smoothing": 0.7,
                    "gain": 1,
                    "thresholds": {
                        "bass": 1,
                        "bassExciter": 1,
                        "mid": 1,
                        "high": 1,
                        "volume": 1
                    },
                    "debounceMs": 100,
                    "selectedDeviceId": "6c3a43435ad6c192d80e1c826ef125d0d79eae4629c87a5520a639be53c84082",
                    "audioVisibility": {
                        "numbers": true,
                        "events": false
                    }
                }
            },
            {
                "id": 110,
                "slug": "note",
                "x": 38,
                "y": 464,
                "controls": {},
                "values": {
                    "noteText": "Activate Mic/Line In to the right \n-----> ",
                    "width": "259px",
                    "height": "249px"
                }
            },
            {
                "id": 111,
                "slug": "note",
                "x": 1484,
                "y": 470,
                "controls": {},
                "values": {
                    "noteText": "Mic Line/In ---->",
                    "width": "258px",
                    "height": "177px"
                }
            }
        ],
        "connections": [
            {
                "fromNode": 94,
                "fromPort": "output",
                "toNode": 95,
                "toPort": "texture"
            },
            {
                "fromNode": 95,
                "fromPort": "output",
                "toNode": 96,
                "toPort": "input"
            },
            {
                "fromNode": 98,
                "fromPort": "output",
                "toNode": 99,
                "toPort": "input"
            },
            {
                "fromNode": 99,
                "fromPort": "output",
                "toNode": 100,
                "toPort": "input"
            },
            {
                "fromNode": 101,
                "fromPort": "output",
                "toNode": 100,
                "toPort": "twist"
            },
            {
                "fromNode": 100,
                "fromPort": "output",
                "toNode": 102,
                "toPort": "texture"
            },
            {
                "fromNode": 102,
                "fromPort": "output",
                "toNode": 103,
                "toPort": "input"
            },
            {
                "fromNode": 96,
                "fromPort": "output",
                "toNode": 105,
                "toPort": "input"
            },
            {
                "fromNode": 105,
                "fromPort": "output",
                "toNode": 98,
                "toPort": "input"
            },
            {
                "fromNode": 97,
                "fromPort": "mask",
                "toNode": 106,
                "toPort": "input"
            },
            {
                "fromNode": 106,
                "fromPort": "output",
                "toNode": 105,
                "toPort": "radius"
            },
            {
                "fromNode": 104,
                "fromPort": "mask",
                "toNode": 107,
                "toPort": "input"
            },
            {
                "fromNode": 107,
                "fromPort": "output",
                "toNode": 103,
                "toPort": "contrast"
            },
            {
                "fromNode": 104,
                "fromPort": "mask",
                "toNode": 108,
                "toPort": "input"
            },
            {
                "fromNode": 108,
                "fromPort": "output",
                "toNode": 103,
                "toPort": "brightness"
            },
            {
                "fromNode": 103,
                "fromPort": "output",
                "toNode": 93,
                "toPort": "input"
            },
            {
                "fromNode": 109,
                "fromPort": "bassExciter",
                "toNode": 102,
                "toPort": "distance"
            }
        ],
        "editorWidth": 3374,
        "meta": {
            "name": "Hallucinogen",
            "author": "Cheshire",
            "description": "A trippy music visualizer",
            "thumbnail": "data:image/jpeg;base64,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",
            "savedAt": "2025-09-21T03:00:48.481Z"
        },
        "version": "0.1"
    },
    {
        "nodes": [
            {
                "id": 4,
                "slug": "geissflow",
                "x": 375,
                "y": 79,
                "controls": {
                    "flowSpeed": 0.38,
                    "flowScale": 5,
                    "distortionAmount": 0.1,
                    "feedbackAmount": 0.95,
                    "fadeAmount": 0.98,
                    "swirl": 1
                }
            },
            {
                "id": 5,
                "slug": "output",
                "x": 3147,
                "y": 39,
                "controls": {
                    "showA": "",
                    "showB": "",
                    "snap": "",
                    "rec": ""
                },
                "optionValues": {
                    "resolution": "1280x720",
                    "recordDuration": "manual"
                },
                "values": {
                    "frameHistorySize": 10
                }
            },
            {
                "id": 6,
                "slug": "radialgradient",
                "x": 48,
                "y": 56,
                "controls": {
                    "centerColor": "#7de7f2ff",
                    "edgeColor": "#2b2f85ff",
                    "centerX": 0,
                    "centerY": 0,
                    "radius": 1,
                    "offset": 0
                },
                "optionValues": {
                    "loop_mode": "once"
                }
            },
            {
                "id": 7,
                "slug": "polygon",
                "x": 618,
                "y": 84,
                "controls": {
                    "foreground": "#ffffffff",
                    "background": "#000000ff",
                    "sides": 5,
                    "radius": 1.15,
                    "rotation": 0.1,
                    "softness": 0.01
                }
            },
            {
                "id": 8,
                "slug": "checkerboard",
                "x": 25,
                "y": 425,
                "controls": {
                    "frequency": 8,
                    "color1": "#3e58baff",
                    "color2": "#14237bff"
                }
            },
            {
                "id": 10,
                "slug": "lineargradient",
                "x": 2122,
                "y": 125,
                "controls": {
                    "startColor": "#ffffffff",
                    "endColor": "#000000ff",
                    "angle": 0.005,
                    "frequency": 1,
                    "offset": -0.42,
                    "center": 0
                },
                "optionValues": {
                    "loop_mode": "once"
                }
            },
            {
                "id": 11,
                "slug": "lineargradient",
                "x": 2469,
                "y": 112,
                "controls": {
                    "startColor": "#000000ff",
                    "endColor": "#000000ff",
                    "angle": 0.005,
                    "frequency": 1,
                    "offset": 1.58,
                    "center": 0
                },
                "optionValues": {
                    "loop_mode": "once"
                }
            },
            {
                "id": 12,
                "slug": "chromaticaberration",
                "x": 1790,
                "y": 665,
                "controls": {
                    "offset": 0.1,
                    "angle": 0.159
                },
                "optionValues": {
                    "mode": "radial"
                }
            },
            {
                "id": 13,
                "slug": "colorshift",
                "x": 1039,
                "y": 708,
                "controls": {
                    "hue": -0.011,
                    "saturation": 0.55,
                    "value": 1.23
                }
            },
            {
                "id": 16,
                "slug": "shakycam",
                "x": 763,
                "y": 532,
                "controls": {
                    "xSpeed": 1,
                    "ySpeed": 1,
                    "sinCoeff": 1,
                    "cosCoeff": 1,
                    "amplitude": 0.1
                }
            },
            {
                "id": 17,
                "slug": "translate",
                "x": 1563,
                "y": 95,
                "controls": {
                    "x": 0,
                    "y": -1
                }
            },
            {
                "id": 20,
                "slug": "repeater",
                "x": 899,
                "y": 54,
                "controls": {
                    "sourceX": 0,
                    "sourceY": 0,
                    "sourceWidth": 3.94,
                    "sourceHeight": 2,
                    "rows": 3,
                    "columns": 1,
                    "spacing": 0,
                    "bgColor": "#00000000"
                },
                "optionValues": {
                    "alignment": "center"
                }
            },
            {
                "id": 21,
                "slug": "animation",
                "x": 1208,
                "y": 251,
                "controls": {
                    "startStop": "",
                    "restart": ""
                },
                "optionValues": {
                    "approach_curve": "smooth",
                    "return_curve": "jump"
                },
                "values": {
                    "startValue": -1,
                    "endValue": 1,
                    "duration": 1,
                    "isRunning": true
                }
            },
            {
                "id": 22,
                "slug": "translate",
                "x": 1152,
                "y": 54,
                "controls": {
                    "x": 0,
                    "y": -1
                }
            },
            {
                "id": 23,
                "slug": "micline",
                "x": 261,
                "y": 394,
                "controls": {},
                "values": {
                    "volume": 1,
                    "smoothing": 0.7,
                    "gain": 1,
                    "thresholds": {
                        "bass": 1,
                        "bassExciter": 1,
                        "mid": 1,
                        "high": 1,
                        "volume": 1
                    },
                    "debounceMs": 100,
                    "selectedDeviceId": "default",
                    "audioVisibility": {
                        "numbers": true,
                        "events": false
                    }
                }
            },
            {
                "id": 24,
                "slug": "reframerange",
                "x": 500,
                "y": 443,
                "controls": {
                    "input": 0.5,
                    "inMin": 0,
                    "inMax": 1,
                    "outMin": 0.4,
                    "outMax": 1.3
                },
                "optionValues": {
                    "clamp": "off"
                }
            },
            {
                "id": 25,
                "slug": "zoom",
                "x": 1392,
                "y": 743,
                "controls": {
                    "zoom": 1.12
                }
            },
            {
                "id": 26,
                "slug": "reframerange",
                "x": 1063,
                "y": 460,
                "controls": {
                    "input": 0.5,
                    "inMin": 0,
                    "inMax": 1,
                    "outMin": 0.6,
                    "outMax": 1.15
                },
                "optionValues": {
                    "clamp": "off"
                }
            },
            {
                "id": 27,
                "slug": "contrast",
                "x": 2801,
                "y": 155,
                "controls": {
                    "contrast": 1.33,
                    "brightness": 0.15
                }
            },
            {
                "id": 30,
                "slug": "feedbackmix",
                "x": 1822,
                "y": 145,
                "controls": {
                    "delayAmount": 0.31,
                    "mix": 0.24
                }
            }
        ],
        "connections": [
            {
                "fromNode": 6,
                "fromPort": "output",
                "toNode": 4,
                "toPort": "input"
            },
            {
                "fromNode": 6,
                "fromPort": "output",
                "toNode": 7,
                "toPort": "background"
            },
            {
                "fromNode": 8,
                "fromPort": "output",
                "toNode": 6,
                "toPort": "edgeColor"
            },
            {
                "fromNode": 10,
                "fromPort": "output",
                "toNode": 11,
                "toPort": "endColor"
            },
            {
                "fromNode": 12,
                "fromPort": "output",
                "toNode": 10,
                "toPort": "endColor"
            },
            {
                "fromNode": 12,
                "fromPort": "output",
                "toNode": 11,
                "toPort": "startColor"
            },
            {
                "fromNode": 4,
                "fromPort": "output",
                "toNode": 7,
                "toPort": "foreground"
            },
            {
                "fromNode": 7,
                "fromPort": "color",
                "toNode": 16,
                "toPort": "input"
            },
            {
                "fromNode": 16,
                "fromPort": "output",
                "toNode": 13,
                "toPort": "input"
            },
            {
                "fromNode": 7,
                "fromPort": "color",
                "toNode": 20,
                "toPort": "input"
            },
            {
                "fromNode": 20,
                "fromPort": "output",
                "toNode": 22,
                "toPort": "input"
            },
            {
                "fromNode": 22,
                "fromPort": "output",
                "toNode": 17,
                "toPort": "input"
            },
            {
                "fromNode": 21,
                "fromPort": "output",
                "toNode": 17,
                "toPort": "y"
            },
            {
                "fromNode": 24,
                "fromPort": "output",
                "toNode": 7,
                "toPort": "radius"
            },
            {
                "fromNode": 23,
                "fromPort": "volume",
                "toNode": 24,
                "toPort": "input"
            },
            {
                "fromNode": 13,
                "fromPort": "output",
                "toNode": 25,
                "toPort": "input"
            },
            {
                "fromNode": 25,
                "fromPort": "output",
                "toNode": 12,
                "toPort": "input"
            },
            {
                "fromNode": 23,
                "fromPort": "bassExciter",
                "toNode": 26,
                "toPort": "input"
            },
            {
                "fromNode": 26,
                "fromPort": "output",
                "toNode": 25,
                "toPort": "zoom"
            },
            {
                "fromNode": 11,
                "fromPort": "output",
                "toNode": 27,
                "toPort": "input"
            },
            {
                "fromNode": 17,
                "fromPort": "output",
                "toNode": 30,
                "toPort": "input"
            },
            {
                "fromNode": 30,
                "fromPort": "output",
                "toNode": 10,
                "toPort": "startColor"
            },
            {
                "fromNode": 27,
                "fromPort": "output",
                "toNode": 5,
                "toPort": "input"
            }
        ],
        "editorWidth": 3559,
        "meta": {
            "name": "LiquidGem",
            "author": "Cheshire",
            "description": "A music visualizer",
            "thumbnail": "data:image/jpeg;base64,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"
        },
        "version": "0.1"
    },
    {
        "nodes": [
            {
                "id": 112,
                "slug": "checkerboard",
                "x": 41,
                "y": 30,
                "controls": {
                    "frequency": 4,
                    "color1": "#000000ff",
                    "color2": "#ff0b0bff"
                }
            },
            {
                "id": 113,
                "slug": "channelsplitter",
                "x": 295,
                "y": 75,
                "controls": {}
            },
            {
                "id": 114,
                "slug": "mosaic",
                "x": 809,
                "y": 33,
                "controls": {
                    "cellSize": 2,
                    "randomness": 0,
                    "borderWidth": 0.1,
                    "borderColor": "#000000ff",
                    "smoothing": 0.02
                },
                "optionValues": {
                    "shape": "square"
                }
            },
            {
                "id": 115,
                "slug": "output",
                "x": 3793,
                "y": 51,
                "controls": {
                    "showA": "",
                    "showB": "",
                    "snap": "",
                    "rec": ""
                },
                "optionValues": {
                    "resolution": "1280x720",
                    "recordDuration": "manual"
                },
                "values": {
                    "frameHistorySize": 10
                }
            },
            {
                "id": 116,
                "slug": "posterize",
                "x": 1091,
                "y": 71,
                "controls": {
                    "levels": 4,
                    "dither": 0,
                    "gamma": 1
                }
            },
            {
                "id": 117,
                "slug": "invert",
                "x": 539,
                "y": 424,
                "controls": {
                    "mix": 1
                }
            },
            {
                "id": 118,
                "slug": "blur",
                "x": 796,
                "y": 458,
                "controls": {
                    "blurX": 1,
                    "blurY": 1
                }
            },
            {
                "id": 119,
                "slug": "checkerboard",
                "x": 1075,
                "y": 402,
                "controls": {
                    "frequency": 4,
                    "color1": "#ffffff00",
                    "color2": "#00000000"
                }
            },
            {
                "id": 120,
                "slug": "layerblend",
                "x": 1653,
                "y": 71,
                "controls": {
                    "background": "#000000ff",
                    "foreground": "#ffffff00",
                    "opacity": 1
                },
                "optionValues": {
                    "blend_mode": "normal"
                }
            },
            {
                "id": 121,
                "slug": "layerblend",
                "x": 1656,
                "y": 374,
                "controls": {
                    "background": "#000000ff",
                    "foreground": "#ffffff00",
                    "opacity": 1
                },
                "optionValues": {
                    "blend_mode": "normal"
                }
            },
            {
                "id": 122,
                "slug": "checkerboard",
                "x": 1380,
                "y": 140,
                "controls": {
                    "frequency": 4,
                    "color1": "#000000ff",
                    "color2": "#000000ff"
                }
            },
            {
                "id": 123,
                "slug": "shakycam",
                "x": 1335,
                "y": 394,
                "controls": {
                    "xSpeed": 1,
                    "ySpeed": 1,
                    "sinCoeff": 1,
                    "cosCoeff": 1,
                    "amplitude": 0.05
                }
            },
            {
                "id": 124,
                "slug": "circle",
                "x": 2180,
                "y": 53,
                "controls": {
                    "foreground": "#ffffffff",
                    "background": "#00000000",
                    "radius": 0.6,
                    "softness": 0.01,
                    "centerX": 0,
                    "centerY": 0
                }
            },
            {
                "id": 125,
                "slug": "translate",
                "x": 2710,
                "y": 349,
                "controls": {
                    "x": -0.95,
                    "y": 0.4
                }
            },
            {
                "id": 126,
                "slug": "channelsplitter",
                "x": 2561,
                "y": 78,
                "controls": {}
            },
            {
                "id": 127,
                "slug": "invert",
                "x": 2803,
                "y": 98,
                "controls": {
                    "mix": 1
                }
            },
            {
                "id": 128,
                "slug": "circle",
                "x": 2946,
                "y": 260,
                "controls": {
                    "foreground": "#ffffffff",
                    "background": "#00000000",
                    "radius": 0.6,
                    "softness": 0.01,
                    "centerX": 0,
                    "centerY": 0
                }
            },
            {
                "id": 129,
                "slug": "translate",
                "x": 3188,
                "y": 273,
                "controls": {
                    "x": 0.95,
                    "y": -0.4
                }
            },
            {
                "id": 130,
                "slug": "channelsplitter",
                "x": 3421,
                "y": 261,
                "controls": {}
            },
            {
                "id": 131,
                "slug": "invert",
                "x": 3439,
                "y": 75,
                "controls": {
                    "mix": 1
                }
            },
            {
                "id": 132,
                "slug": "note",
                "x": 55,
                "y": 612,
                "controls": {},
                "values": {
                    "noteText": "Mic/Line In -----> SCROLL",
                    "width": "200px",
                    "height": "100px"
                }
            },
            {
                "id": 133,
                "slug": "note",
                "x": 1712,
                "y": 652,
                "controls": {},
                "values": {
                    "noteText": "Suggested song for this patch: \n\nKeep Talking - Pink Floyd",
                    "width": "268px",
                    "height": "163px"
                }
            },
            {
                "id": 134,
                "slug": "reframerange",
                "x": 560,
                "y": 75,
                "controls": {
                    "input": 0.5,
                    "inMin": 0,
                    "inMax": 1,
                    "outMin": 2,
                    "outMax": 10
                },
                "optionValues": {
                    "clamp": "off"
                }
            },
            {
                "id": 135,
                "slug": "reframerange",
                "x": 2347,
                "y": 383,
                "controls": {
                    "input": 0.5,
                    "inMin": 0,
                    "inMax": 1,
                    "outMin": -1,
                    "outMax": 1
                },
                "optionValues": {
                    "clamp": "off"
                }
            },
            {
                "id": 136,
                "slug": "reframerange",
                "x": 2350,
                "y": 692,
                "controls": {
                    "input": 0.5,
                    "inMin": 0,
                    "inMax": 1,
                    "outMin": -0.5,
                    "outMax": 0.5
                },
                "optionValues": {
                    "clamp": "off"
                }
            },
            {
                "id": 137,
                "slug": "reframerange",
                "x": 2593,
                "y": 610,
                "controls": {
                    "input": 0.5,
                    "inMin": 0,
                    "inMax": 1,
                    "outMin": 1,
                    "outMax": -1
                },
                "optionValues": {
                    "clamp": "off"
                }
            },
            {
                "id": 138,
                "slug": "reframerange",
                "x": 2854,
                "y": 614,
                "controls": {
                    "input": 0.5,
                    "inMin": 0,
                    "inMax": 1,
                    "outMin": 0.5,
                    "outMax": -0.5
                },
                "optionValues": {
                    "clamp": "off"
                }
            },
            {
                "id": 139,
                "slug": "micline",
                "x": 2003,
                "y": 402,
                "controls": {},
                "values": {
                    "volume": 1,
                    "smoothing": 0.7,
                    "gain": 1,
                    "thresholds": {
                        "bass": 1,
                        "bassExciter": 1,
                        "mid": 1,
                        "high": 1,
                        "volume": 1
                    },
                    "debounceMs": 100,
                    "selectedDeviceId": "6c3a43435ad6c192d80e1c826ef125d0d79eae4629c87a5520a639be53c84082",
                    "audioVisibility": {
                        "numbers": true,
                        "events": false
                    }
                }
            }
        ],
        "connections": [
            {
                "fromNode": 112,
                "fromPort": "output",
                "toNode": 113,
                "toPort": "input"
            },
            {
                "fromNode": 114,
                "fromPort": "output",
                "toNode": 116,
                "toPort": "input"
            },
            {
                "fromNode": 116,
                "fromPort": "output",
                "toNode": 117,
                "toPort": "input"
            },
            {
                "fromNode": 117,
                "fromPort": "output",
                "toNode": 118,
                "toPort": "input"
            },
            {
                "fromNode": 120,
                "fromPort": "output",
                "toNode": 121,
                "toPort": "background"
            },
            {
                "fromNode": 122,
                "fromPort": "output",
                "toNode": 120,
                "toPort": "background"
            },
            {
                "fromNode": 119,
                "fromPort": "output",
                "toNode": 123,
                "toPort": "input"
            },
            {
                "fromNode": 123,
                "fromPort": "output",
                "toNode": 121,
                "toPort": "foreground"
            },
            {
                "fromNode": 124,
                "fromPort": "color",
                "toNode": 125,
                "toPort": "input"
            },
            {
                "fromNode": 125,
                "fromPort": "output",
                "toNode": 126,
                "toPort": "input"
            },
            {
                "fromNode": 121,
                "fromPort": "output",
                "toNode": 127,
                "toPort": "input"
            },
            {
                "fromNode": 126,
                "fromPort": "a",
                "toNode": 127,
                "toPort": "mix"
            },
            {
                "fromNode": 128,
                "fromPort": "color",
                "toNode": 129,
                "toPort": "input"
            },
            {
                "fromNode": 129,
                "fromPort": "output",
                "toNode": 130,
                "toPort": "input"
            },
            {
                "fromNode": 130,
                "fromPort": "a",
                "toNode": 131,
                "toPort": "mix"
            },
            {
                "fromNode": 127,
                "fromPort": "output",
                "toNode": 131,
                "toPort": "input"
            },
            {
                "fromNode": 116,
                "fromPort": "output",
                "toNode": 122,
                "toPort": "color1"
            },
            {
                "fromNode": 118,
                "fromPort": "output",
                "toNode": 119,
                "toPort": "color2"
            },
            {
                "fromNode": 113,
                "fromPort": "r",
                "toNode": 134,
                "toPort": "input"
            },
            {
                "fromNode": 134,
                "fromPort": "output",
                "toNode": 114,
                "toPort": "cellSize"
            },
            {
                "fromNode": 135,
                "fromPort": "output",
                "toNode": 125,
                "toPort": "x"
            },
            {
                "fromNode": 136,
                "fromPort": "output",
                "toNode": 125,
                "toPort": "y"
            },
            {
                "fromNode": 137,
                "fromPort": "output",
                "toNode": 129,
                "toPort": "x"
            },
            {
                "fromNode": 138,
                "fromPort": "output",
                "toNode": 129,
                "toPort": "y"
            },
            {
                "fromNode": 131,
                "fromPort": "output",
                "toNode": 115,
                "toPort": "input"
            },
            {
                "fromNode": 139,
                "fromPort": "bassExciter",
                "toNode": 135,
                "toPort": "input"
            },
            {
                "fromNode": 139,
                "fromPort": "mid",
                "toNode": 136,
                "toPort": "input"
            },
            {
                "fromNode": 139,
                "fromPort": "bassExciter",
                "toNode": 137,
                "toPort": "input"
            },
            {
                "fromNode": 139,
                "fromPort": "mid",
                "toNode": 138,
                "toPort": "input"
            }
        ],
        "editorWidth": 4374,
        "meta": {
            "name": "80sCircleDance",
            "author": "Cheshire",
            "description": "A music visualizer",
            "thumbnail": "data:image/jpeg;base64,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",
            "savedAt": "2025-09-21T03:02:36.617Z"
        },
        "version": "0.1"
    },
    {
        "nodes": [
            {
                "id": 67,
                "slug": "video",
                "x": 10,
                "y": 42,
                "controls": {
                    "play": "",
                    "pause": "",
                    "stop": "",
                    "randomizeTime": ""
                },
                "values": {
                    "playbackRate": 1,
                    "thresholds": {
                        "bass": 1,
                        "bassExciter": 1,
                        "mid": 1,
                        "high": 1
                    },
                    "debounceMs": 100,
                    "assetPath": null,
                    "audioVisibility": {
                        "numbers": true,
                        "events": false
                    }
                }
            },
            {
                "id": 68,
                "slug": "stripes",
                "x": 967,
                "y": 45,
                "controls": {
                    "frequency": 30,
                    "phase": 0.5,
                    "rotation": 0.25,
                    "color1": "#ecd5d5ff",
                    "color2": "#621313ff",
                    "smoothing": 0.01
                }
            },
            {
                "id": 69,
                "slug": "output",
                "x": 1504,
                "y": 29,
                "controls": {
                    "showA": "",
                    "showB": "",
                    "snap": "",
                    "rec": ""
                },
                "optionValues": {
                    "resolution": "1024x768",
                    "recordDuration": "manual"
                },
                "values": {
                    "frameHistorySize": 10
                }
            },
            {
                "id": 70,
                "slug": "luminosity",
                "x": 511,
                "y": 70,
                "controls": {}
            },
            {
                "id": 71,
                "slug": "blur",
                "x": 311,
                "y": 61,
                "controls": {
                    "blurX": 8,
                    "blurY": 8
                }
            },
            {
                "id": 72,
                "slug": "reframerange",
                "x": 715,
                "y": 12,
                "controls": {
                    "input": 0.5,
                    "inMin": 0,
                    "inMax": 1,
                    "outMin": 0,
                    "outMax": 0.82
                },
                "optionValues": {
                    "clamp": "off"
                }
            },
            {
                "id": 73,
                "slug": "feedback",
                "x": 284,
                "y": 388,
                "controls": {}
            },
            {
                "id": 74,
                "slug": "layerblend",
                "x": 1201,
                "y": 129,
                "controls": {
                    "background": "#000000ff",
                    "foreground": "#ffffffff",
                    "opacity": 0.42
                },
                "optionValues": {
                    "blend_mode": "normal"
                }
            },
            {
                "id": 75,
                "slug": "colorshift",
                "x": 491,
                "y": 356,
                "controls": {
                    "hue": 0.165,
                    "saturation": 1.85,
                    "value": 1
                }
            },
            {
                "id": 76,
                "slug": "fisheye",
                "x": 752,
                "y": 373,
                "controls": {
                    "distortion": 0.01,
                    "radius": 5,
                    "centerX": 2,
                    "centerY": -1.06
                },
                "controlRanges": {
                    "radius": {
                        "min": 0.01,
                        "max": 5
                    }
                }
            }
        ],
        "connections": [
            {
                "fromNode": 67,
                "fromPort": "output",
                "toNode": 71,
                "toPort": "input"
            },
            {
                "fromNode": 71,
                "fromPort": "output",
                "toNode": 70,
                "toPort": "input"
            },
            {
                "fromNode": 70,
                "fromPort": "output",
                "toNode": 72,
                "toPort": "input"
            },
            {
                "fromNode": 72,
                "fromPort": "output",
                "toNode": 68,
                "toPort": "phase"
            },
            {
                "fromNode": 68,
                "fromPort": "output",
                "toNode": 74,
                "toPort": "foreground"
            },
            {
                "fromNode": 73,
                "fromPort": "output",
                "toNode": 75,
                "toPort": "input"
            },
            {
                "fromNode": 75,
                "fromPort": "output",
                "toNode": 76,
                "toPort": "input"
            },
            {
                "fromNode": 76,
                "fromPort": "output",
                "toNode": 74,
                "toPort": "background"
            },
            {
                "fromNode": 74,
                "fromPort": "output",
                "toNode": 69,
                "toPort": "input"
            }
        ],
        "editorWidth": 1886,
        "meta": {
            "name": "Windowpane",
            "author": "figrita",
            "description": "Luminosity to stripes, play a video",
            "thumbnail": "data:image/jpeg;base64,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"
        },
        "version": "0.2"
    }
];

/**
 * Load default patches asynchronously
 * @returns {Promise<Array>} Array of default patch objects
 */
export async function loadDefaultPatches() {
    return defaultPatches;
}