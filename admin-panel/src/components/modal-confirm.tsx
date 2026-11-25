"use client";

import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

interface ModalConfirmProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title: string;
    description: string;
    confirmText?: string;
    cancelText?: string;
    variant?: "default" | "destructive";
    isLoading?: boolean;
}

export function ModalConfirm({
    isOpen,
    onClose,
    onConfirm,
    title,
    description,
    confirmText = "Confirmar",
    cancelText = "Cancelar",
    variant = "default",
    isLoading = false,
}: ModalConfirmProps) {
    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <div className="flex items-center gap-3 mb-2">
                        <div className={`p-2 rounded-full ${variant === 'destructive' ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-600'}`}>
                            <AlertTriangle className="h-5 w-5" />
                        </div>
                        <DialogTitle className="text-xl font-bold">{title}</DialogTitle>
                    </div>
                    <DialogDescription className="text-slate-500 pt-2">
                        {description}
                    </DialogDescription>
                </DialogHeader>
                <DialogFooter className="gap-2 sm:gap-0 pt-6">
                    <Button variant="ghost" onClick={onClose} disabled={isLoading}>
                        {cancelText}
                    </Button>
                    <Button
                        variant={variant}
                        onClick={onConfirm}
                        disabled={isLoading}
                        className={variant === 'destructive' ? 'bg-red-600 hover:bg-red-700' : ''}
                    >
                        {isLoading ? "Processando..." : confirmText}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
