import React, { useEffect, useState } from "react";
import { FaMagic } from "react-icons/fa";
import "./index.scss";
import Typed from "typed.js";
import { marked } from "marked";

const cls = "ai-summary";

export function AiSummary({ content }) {
  const [show, setShow] = useState(false);
  const el = React.useRef(null);

  useEffect(() => {
    if (!show) {
      return;
    }

    const parsedContent = marked.parse(content) as string;

    const typed = new Typed(el.current, {
      strings: [parsedContent],
      startDelay: 300,
      typeSpeed: 10,
      showCursor: false,
    });

    return () => {
      // Destroy Typed instance during cleanup to stop animation
      typed.destroy();
    };
  }, [show]);

  return (
    <div className={cls}>
      {!show && (
        <button
          data-umami-event="ai-summary"
          className={`${cls}-button`}
          onClick={() => {
            setShow(!show);
          }}
        >
          <FaMagic />
          <span>
            AI 摘要 <sup>powered by gemini</sup>
          </span>
        </button>
      )}

      {show && (
        <div className={`${cls}-content`}>
          <div className={`${cls}-title`}>
            <FaMagic style={{ marginRight: 5 }} />
            <span>
              AI 摘要 <sup>powered by gemini</sup>
            </span>
          </div>

          <span ref={el}></span>
        </div>
      )}
    </div>
  );
}
