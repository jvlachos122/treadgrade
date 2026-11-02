import { readSizeMark, sizeMarkSentences } from "../lib/size-mark.js";

export function initSizeMark(root) {
  const input = root.querySelector("input");
  const output = root.querySelector("[data-size-output]");
  const form = root.querySelector("form");
  if (!input || !output) return;

  function render() {
    output.replaceChildren();
    for (const sentence of sizeMarkSentences(readSizeMark(input.value))) {
      const paragraph = document.createElement("p");
      paragraph.textContent = sentence;
      output.append(paragraph);
    }
  }

  form?.addEventListener("submit", (event) => {
    event.preventDefault();
    render();
  });
  input.addEventListener("input", render);
  for (const button of root.querySelectorAll("[data-example]")) {
    button.addEventListener("click", () => {
      input.value = button.dataset.example || "";
      render();
      input.focus();
    });
  }
}
