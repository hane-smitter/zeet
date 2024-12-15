import blessed from "blessed";

export function createScreen() {
  // Create a screen object
  const screen = blessed.screen({
    smartCSR: true,
    title: "mygit history",
    cursor: {
      artificial: true, // Use a custom blinking cursor
      shape: "block", // Shape of the cursor (e.g., block, underline)
      blink: true, // Enable blinking
      color: "#6CD56C",
    },
  });

  // Create a box for the logs
  const logBox = blessed.box({
    top: "0",
    left: "0",
    width: "100%",
    height: "94%", // Adjust height to leave room for the help message
    tags: true,
    content: "",
    scrollable: true,
    alwaysScroll: false,
    scrollbar: {
      ch: " ",
      track: {
        bg: "#1B3A1B",
      },
      style: {
        bg: "#51A051",
      },
    },
    border: {
      type: "line",
    },
    style: {
      fg: "green",
      bg: "black",
      border: {
        fg: "#f0f0f0",
      },
    },
    input: true, // Allow text input
    keyable: true, // Make box focusable
    mouse: true, // Enable mouse support
    selectable: true,
    // draggable: true,
  });
  // Focus the logBox and enable the cursor
  logBox.focus();
  logBox.style.focus = {
    fg: "yellow", // Highlight color when focused
    bg: "black",
  };
  logBox.style.selected = {
    bg: "cyan", // Highlight color for selected text
    fg: "black",
  };

  // Create a box for the help message
  const helpBox = blessed.box({
    bottom: "0", // Position at the bottom of the screen
    left: "0",
    width: "100%",
    height: "8%", // Take 10% of the screen height
    content:
      "Press 'q', 'ESC', or 'Ctrl+C' to exit.\nUse mouse wheel, up/down arrow keys to scroll.",
    align: "left", // Center the text horizontally
    valign: "middle", // Center the text vertically
    style: {
      fg: "#f0f0f0",
      bg: "#282828",
    },
  });

  // Append the log box and help box to the screen
  screen.append(logBox);
  screen.append(helpBox);

  // Add key bindings for scrolling
  screen.key(["up", "down"], (ch, key) => {
    if (key.name === "up") {
      logBox.scroll(-1); // Scroll up
    } else if (key.name === "down") {
      logBox.scroll(1); // Scroll down
    }
    screen.render();
  });

  // Enable mouse-based scrolling
  logBox.on("mouse", (data) => {
    if (data.action === "wheelup") {
      logBox.scroll(-1); // Scroll up on mouse wheel up
    } else if (data.action === "wheeldown") {
      logBox.scroll(1); // Scroll down on mouse wheel down
    }
    screen.render();
  });

  // Add key bindings for quitting
  screen.key(["escape", "q", "C-c"], () => {
    process.exit(0);
  });

  // Add log messages
  return {
    screen,
    logBox,
    addMsg: (message: string) => {
      logBox.setContent(logBox.getContent() + message + "\n");
      //   logBox.scrollTo(logBox.getScrollHeight());
      screen.render();
    },
    render: () => screen.render(),
    exit: () => process.exit(0),
  };
}
