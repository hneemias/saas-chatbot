"use client";

import { useEffect } from "react";

interface PageTitleProps {
    title: string;
}

export function PageTitle({ title }: PageTitleProps) {
    useEffect(() => {
        const event = new CustomEvent("app-title-change", { detail: title });
        window.dispatchEvent(event);

        return () => {
            const resetEvent = new CustomEvent("app-title-change", { detail: null });
            window.dispatchEvent(resetEvent);
        };
    }, [title]);

    return null;
}
