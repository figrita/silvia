# Silvia FAQ

## Understanding the Basics

### What is a Node?

A node in Silvia is like a building block that combines two things:

**A user interface component** that you see and interact with - knobs, sliders, buttons, and custom interfaces that let you control what the node is doing.

**A GPU code snippet** that generates patterns or performs calculations on your graphics card. When you adjust the UI controls, you're changing how this code behaves.

**How nodes work together:** When you connect nodes, you're determining the order they evaluate in. The connections create a dependency chain - Node A must calculate its pattern before Node B can use it as input.

**The compilation process:** When you connect nodes to an Output node, Silvia triggers a "compilation" where all the connected nodes contribute their code snippets into one large script that runs on your GPU. This script generates the final image in real-time.

**Real-time updates:** Some nodes send per-frame data from your CPU to influence the GPU visualization. For example:
- Audio analysis nodes send audio meters
- Brick Breaker sends entire game frames
- Animation nodes send smooth timing values

**CPU-only nodes:** Some nodes run entirely on your main processor and don't generate visual patterns at all. For example Step Sequencer simply sends Events to orchestrate other nodes.

### What are Number, Color, and Event connections?

Silvia has three types of connections that work very differently:

**Number connections (green)** carry numeric patterns across the image. For any given pixel, a Number might be something like 4, or 0.2, or -1. These aren't single values—they're instructions for creating patterns where every pixel might have a different number. A gradient, for example, might go from 0.0 on the left to 1.0 on the right.

**Color connections (orange)** carry visual patterns made of four numbers per pixel: red, green, blue, and alpha (transparency). For example, one pixel might be (1.0, 0.5, 0.0, 1.0) for bright orange, while another pixel might be (0.2, 0.8, 0.3, 0.7) for semi-transparent green. Like Numbers, these vary across the image—a rainbow gradient has different color values at every position.

**Event connections (purple)** are completely different. These carry timing signals and triggers that happen at specific moments, like "start now" or "gate on/off." Events work only on your CPU and can trigger actions, change settings, or control timing.

### What is Silvia's coordinate system?

Silvia uses a coordinate system called "half-height units" where:

- **Screen center is always (0, 0)**
- **Screen height is always 2.0 units** (from -1 at bottom to +1 at top)
- **Screen width varies by aspect ratio** to keep pixels square
- **Everything scales consistently** regardless of your actual screen resolution

For example: A circle with radius 0.5 always appears as half the screen height, no matter if you're on a 4:3 monitor or a 16:9 projector.

**All content uses this system:** Images, videos, patterns, and animations are all normalized to this 2.0-unit height and scaled proportionally wide to preserve square pixels.

### What happens when you connect to the Output node?

The Output node is special—it's what actually displays your visuals on screen. When you connect patterns to an Output node, several things happen:

**Compilation is triggered:** Silvia traces back through all the connections from the Output node and gathers up the code snippets from every connected node. It combines these into one large script that runs on your GPU.

**Dependency order is determined:** Silvia figures out which nodes need to calculate first. For example, if you have Perlin Noise → Circle → Output, the noise must be calculated before the circle can use it.

**Real-time rendering begins:** The compiled script runs continuously on your graphics card, generating 60 frames per second. Any changes you make to controls instantly affect the running script.

## Common Questions

### Why isn't there a node that can compare Number values and trigger Events?

This is one of the most common questions from new users, and it reveals a fundamental misunderstanding about how connections work.

**The core issue:** Numbers in Silvia are patterns across the entire image, not single values. A gradient might be 0.2 on the left, 0.5 in the middle, and 0.8 on the right. Which value would you compare? The comparison would be simultaneously true AND false across different parts of the image.

**Even checking a single point isn't possible** due to the GPU/CPU boundary. Silvia's patterns are generated on your graphics card (GPU) for maximum performance, but Events need to happen on your main processor (CPU). There's no efficient two-way communication between them—the GPU can't send values back to the CPU without destroying performance.

### How does the Debug node demonstrate this?

The Debug node is perfect for understanding how Numbers work. It samples a Number at a specific screen position and displays the value as text (using janky hacks).

**The key insight:** When you move the Debug node's position around the screen, **the displayed number changes**. Connect a gradient or noise pattern and watch the numbers change as you move the debug position around. This proves that there's no single "the value"—every position has its own value.

The Debug node cannot send this value back to the CPU for triggering Events. The visuals are generated on the GPU, and the CPU has no way to know what value is at any given pixel. It goes from GPU to screen directly.

### Why does Silvia prevent certain cyclical connections?

Silvia prevents cyclical connections because they create logical errors, not performance issues.

When you create a cycle, you're essentially saying:
- "X = X + 3, solve for X" (impossible)

Instead of:
- "X = Y + 3, Y = 2, solve for X" (X = 5)

If Node A's output feeds into Node B, and Node B's output feeds back into Node A, there's no way to determine what values should be generated. Each node's pattern depends on the other, creating an infinite logical loop that cannot be resolved.

## Additional Questions

### "Can I get the output value of a node?"

**Yes, but only visually.** The Debug node lets you see the actual numeric value at any position on screen. You can connect any Number output to a Debug node and it will display the value as text overlay. However, this value can't be used to trigger Events or control other aspects of your patch—it's purely for visual monitoring and debugging.

### "Why is it called Silvia?"
[Pepe Silvia](https://knowyourmeme.com/memes/pepe-silvia)

### "Why does Silvia freeze on firefox?"
Firefox doesn't support https://developer.mozilla.org/en-US/docs/Web/API/KHR_parallel_shader_compile which Silvia relies on to compile shaders in the background without blocking the UI. Use Chrome, Edge, Safari, or the desktop app for best performance.

---

Understanding these concepts will help you design effective nodes and create patches that work with Silvia's architecture rather than against it.