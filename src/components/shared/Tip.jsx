import React, { useState, useRef, useEffect } from 'react';

export function Tip({ children, text, width = 200 }) {
    const [show, setShow] = useState(false);
    const tipRef = useRef(null);
    const containerRef = useRef(null);
    const [positionStyle, setPositionStyle] = useState({});

    useEffect(() => {
        if (show && tipRef.current && containerRef.current) {
            const tipRect = tipRef.current.getBoundingClientRect();
            const containerRect = containerRef.current.getBoundingClientRect();

            let newStyle = {
                bottom: "calc(100% + 6px)",
                left: "50%",
                transform: "translateX(-50%)",
            };

            // Check right edge
            if (containerRect.left + (tipRect.width / 2) > window.innerWidth - 10) {
                newStyle = {
                    bottom: "calc(100% + 6px)",
                    left: "auto",
                    right: 0,
                    transform: "none",
                };
            }
            // Check left edge
            else if (containerRect.left - (tipRect.width / 2) < 10) {
                newStyle = {
                    bottom: "calc(100% + 6px)",
                    left: 0,
                    right: "auto",
                    transform: "none",
                };
            }

            setPositionStyle(newStyle);
        }
    }, [show]);

    return (
        <span
            ref={containerRef}
            style={{ position: "relative", display: "inline-block", cursor: "help" }}
            onMouseEnter={() => setShow(true)}
            onMouseLeave={() => setShow(false)}
            onTouchStart={() => setShow(!show)}
            role="tooltip"
            aria-label={text}
        >
            {children}
            {show && (
                <div ref={tipRef} className="fadeIn" style={{
                    position: "absolute",
                    ...positionStyle,
                    background: "#0c1c2a",
                    border: "1px solid #38c0fc44",
                    borderRadius: 7,
                    padding: "7px 10px",
                    width,
                    zIndex: 9999,
                    fontSize: 8.5,
                    color: "#8ab8d0",
                    lineHeight: 1.65,
                    pointerEvents: "none",
                    boxShadow: "0 8px 32px #00000088",
                    whiteSpace: "normal"
                }}>
                    {text}
                </div>
            )}
        </span>
    );
}
