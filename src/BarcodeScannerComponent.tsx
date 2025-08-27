import React, {useEffect, useRef} from 'react';
import {Html5QrcodeScanner, Html5QrcodeSupportedFormats} from 'html5-qrcode';

// Hilfsfunktion zur Validierung von EAN-8 und EAN-13 Barcodes mittels Prüfsumme.
// Dies ist der entscheidende Schritt, um fehlerhafte Scans herauszufiltern.
function isValidEan(barcode: string): boolean {
    if (!/^\d+$/.test(barcode)) return false; // Darf nur aus Ziffern bestehen

    const len = barcode.length;
    if (len !== 8 && len !== 13) return false; // Muss EAN-8 oder EAN-13 sein

    const digits = barcode.split('').map(Number);
    const checkDigit = digits.pop()!; // Die letzte Ziffer ist die Prüfziffer

    let sum
    if (len === 13) {
        // EAN-13 Prüfsummen-Berechnung (Gewichtung 1, 3, 1, 3, ...)
        sum = digits.reduce((acc, digit, index) => acc + (index % 2 === 0 ? digit : digit * 3), 0);
    } else { // len === 8
        // EAN-8 Prüfsummen-Berechnung (Gewichtung 3, 1, 3, 1, ...)
        sum = digits.reduce((acc, digit, index) => acc + (index % 2 === 0 ? digit * 3 : digit), 0);
    }

    const calculatedCheckDigit = (10 - (sum % 10)) % 10;

    return calculatedCheckDigit === checkDigit;
}

interface BarcodeScannerComponentProps {
    onScanSuccess: (decodedText: string, decodedResult: any) => void;
    onScanFailure?: (error: string) => void;
}

const BarcodeScannerComponent: React.FC<BarcodeScannerComponentProps> = (props) => {
    // Ein Ref, um die `props` zu speichern. Dies ermöglicht den Zugriff auf die neuesten
    // Callback-Funktionen im `useEffect`, ohne sie zur Abhängigkeitsliste hinzufügen zu müssen,
    // was Probleme im Strict Mode (doppeltes rendern) verhindert.
    const propsRef = useRef(props);
    useEffect(() => {
        propsRef.current = props;
    });

    useEffect(() => {
        // Dieser Effekt wird nur EINMAL beim Mounten der Komponente ausgeführt.
        const config = {
            fps: 10,
            qrbox: {width: 250, height: 150},
            rememberLastUsedCamera: true,
            videoConstraints: {
                facingMode: 'environment'
            },
            formatsToSupport: [
                Html5QrcodeSupportedFormats.EAN_13,
                Html5QrcodeSupportedFormats.EAN_8
            ],
            useBarCodeDetectorIfSupported: true,
            showTorchButtonIfSupported: true,

        };

        const scanner = new Html5QrcodeScanner('reader', config, false /* verbose */);

        const onScanSuccessWrapper = (decodedText: string, decodedResult: any) => {
            // **ENTSCHEIDENDER SCHRITT: Validierung des gescannten Barcodes.**
            if (isValidEan(decodedText)) {
                console.log(`Gültiger EAN-Code erkannt: ${decodedText}`);
                // Ruft den eigentlichen Success-Handler der Elternkomponente auf.
                propsRef.current.onScanSuccess(decodedText, decodedResult);
            } else {
                // Optional: Ignorierte Scans für Debugging-Zwecke protokollieren.
                // Dies hilft zu sehen, was der Scanner "denkt", stört aber den Benutzer nicht.
                console.log(`Ignoriere ungültigen oder falsch gelesenen Barcode: ${decodedText}`);
            }
        };

        const onScanFailureWrapper = (error: string) => {
            // Wir können den häufigen Fehler "code not found" ignorieren, da er erwartet wird.
            if (error.includes("not found")) {
                return;
            }
            propsRef.current.onScanFailure?.(error);
        };

        scanner.render(onScanSuccessWrapper, onScanFailureWrapper);

        // Wichtige Aufräumfunktion: Stoppt die Kamera, wenn die Komponente geschlossen wird.
        return () => {
            scanner.clear().catch(error => {
                console.error("Fehler beim Bereinigen des Scanners:", error);
            });
        };
    }, []); // Leeres Array stellt sicher, dass dieser Effekt nur einmal ausgeführt wird.

    return <div id="reader" style={{width: '100%'}}/>;
};

export default BarcodeScannerComponent;