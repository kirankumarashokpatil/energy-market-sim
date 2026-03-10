import { useState, useEffect, useRef, useCallback } from 'react';
import { GUN_PEERS } from '../shared/constants.js';

export function useGun() {
    const gunRef = useRef(null);
    const [ready, setReady] = useState(false);
    useEffect(() => {
        if (window.Gun) { gunRef.current = new window.Gun(GUN_PEERS); setReady(true); return; }
        const s = document.createElement("script");
        s.src = "https://cdn.jsdelivr.net/npm/gun/gun.js";
        s.onload = () => { gunRef.current = new window.Gun(GUN_PEERS); setReady(true); };
        s.onerror = () => setReady("error");
        document.head.appendChild(s);
    }, []);
    return { gun: gunRef, ready };
}

export function useToasts() {
    const [toasts, setToasts] = useState([]);
    const add = useCallback(t => {
        const id = `toast_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        setToasts(prev => [...prev.slice(-4), { ...t, id, exiting: false }]);
        setTimeout(() => {
            setToasts(prev => prev.map(x => x.id === id ? { ...x, exiting: true } : x));
            setTimeout(() => setToasts(prev => prev.filter(x => x.id !== id)), 280);
        }, 4200);
    }, []);
    return { toasts, add };
}
