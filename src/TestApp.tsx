import React from "react";

export default function TestApp() {
    return (
        <input
            type="text"
            id="barcode"
            name="barcode"
            onKeyDown={(e) => {
                console.log('Key: ' + e.key)
                console.log('KeyCode: ' + e.keyCode)
                console.log('CharCode: ' + e.charCode);
                console.log('Code: ' + e.code);
                if (e.key === 'Enter') {
                    // Verhindert, dass das Hauptformular abgeschickt wird
                    e.preventDefault();
                    console.log("Enter wurde gedrückt")
                }
            }}
            placeholder="Barcode eingeben oder scannen"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition duration-200"
        />
    )
}