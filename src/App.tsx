/// <reference types="vite/client" />

import React, {ChangeEvent, FormEvent, useEffect, useState} from 'react';
import {initializeApp} from 'firebase/app';
import {getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut} from 'firebase/auth';
import {addDoc, collection, deleteDoc, doc, Firestore, getFirestore, onSnapshot, updateDoc} from 'firebase/firestore';
import {Camera, LogOut, Pencil, Plus, Search, Trash2, X} from 'lucide-react';
import {addDays, format, isBefore} from 'date-fns';
import BarcodeScanner from 'react-qr-barcode-scanner';

// Definiere eine Schnittstelle für die Lebensmittel-Objekte
interface Food {
    id: string;
    name: string;
    brands: string;
    expiryDate: string;
    storageDate: string;
    location: string;
    quantity: number;
    barcode: string;
    image: string;
}

// Typ für neue Lebensmittel, die noch keine ID haben
type NewFood = Omit<Food, 'id'>;

// Lade Konfiguration aus den Environment-Variablen (für Vite mit VITE_ Prefix)
const appId = import.meta.env.VITE_APP_ID || 'default-app-id';
const firebaseConfigString = import.meta.env.VITE_FIREBASE_CONFIG;
const firebaseConfig = firebaseConfigString ? JSON.parse(firebaseConfigString) : {};

// Die Haupt-App-Komponente
export default function App() {
    const [foods, setFoods] = useState<Food[]>([]);
    const [newFood, setNewFood] = useState<NewFood>({
        name: '',
        brands: '',
        expiryDate: '',
        storageDate: format(new Date(), 'yyyy-MM-dd'),
        location: '',
        quantity: 1,
        barcode: '',
        image: ''
    });
    const [editingId, setEditingId] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [isAuthReady, setIsAuthReady] = useState(false);
    const [userId, setUserId] = useState<string | null>(null);
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [foodToDelete, setFoodToDelete] = useState<Food | null>(null);
    const [showErrorModal, setShowErrorModal] = useState({visible: false, message: ''});
    const [searchTerm, setSearchTerm] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [authError, setAuthError] = useState<string | null>(null);

    const [db, setDb] = useState<Firestore | null>(null); // Firestore instance
    const [isScannerOpen, setIsScannerOpen] = useState(false); // State for scanner visibility

    // Initialisiere Firebase und authentifiziere den Benutzer
    useEffect(() => {
        if (Object.keys(firebaseConfig).length === 0) {
            console.error('Firebase-Konfiguration ist nicht verfügbar.');
            setLoading(false);
            return;
        }

        const app = initializeApp(firebaseConfig);
        const firestore = getFirestore(app);
        const authService = getAuth(app);
        setDb(firestore);

        // Listener für den Authentifizierungsstatus
        const unsubscribeAuth = onAuthStateChanged(authService, (user) => {
            if (user) {
                setUserId(user.uid);
                setIsAuthReady(true);
                console.log('Benutzer authentifiziert. User ID:', user.uid);
            } else {
                setUserId(null);
                console.log('Kein Benutzer angemeldet.');
                setIsAuthReady(true);
            }
        });

        return () => unsubscribeAuth();
    }, []);

    // Echtzeit-Listener für die Lebensmittelliste
    useEffect(() => {
        // Wir warten, bis die Authentifizierung abgeschlossen ist UND ein Benutzer angemeldet ist.
        if (!isAuthReady || !userId || !db) {
            // Wenn kein Benutzer da ist (z.B. nach Logout), setzen wir die Liste zurück.
            if (isAuthReady && !userId) {
                setFoods([]);
                setLoading(false);
            }
            return;
        }

        setLoading(true); // Ladezustand vor dem Abruf aktivieren
        const foodCollectionPath = `artifacts/${appId}/foodItems`;
        const q = collection(db, foodCollectionPath);
        console.log('Listener für die Sammlung wird für User eingerichtet:', userId);

        const unsubscribe = onSnapshot(q, (querySnapshot) => {
            const items: Food[] = [];
            querySnapshot.forEach((doc) => {
                items.push({id: doc.id, ...doc.data()} as Food);
            });
            // Sortiere die Lebensmittel nach Ablaufdatum
            items.sort((a, b) => {
                const aHasDate = a.expiryDate && a.expiryDate !== '';
                const bHasDate = b.expiryDate && b.expiryDate !== '';

                if (aHasDate && !bHasDate) {
                    return -1; // a (mit Datum) kommt vor b (ohne Datum)
                }
                if (!aHasDate && bHasDate) {
                    return 1; // b (mit Datum) kommt vor a (ohne Datum)
                }
                if (!aHasDate && !bHasDate) {
                    return 0; // Beide haben kein Datum, Reihenfolge egal
                }
                // Beide haben ein Datum, sortiere chronologisch aufsteigend
                return new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime();
            });
            setFoods(items);
            setLoading(false);
        }, (error) => {
            console.error('Fehler beim Abrufen der Lebensmittel:', error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [isAuthReady, db, userId]); // <-- WICHTIG: userId als Abhängigkeit hinzufügen

    // Handler für Formularänderungen
    const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
        const {name, value} = e.target;
        setNewFood(prev => ({...prev, [name]: name === 'quantity' ? (parseInt(value, 10) || 1) : value}));
    };

    // Handler für den Barcode-Abruf unter Verwendung der Open Food Facts API
    const handleFetchBarcodeData = async (barcodeToFetch?: string) => {
        const barcode = barcodeToFetch || newFood.barcode;
        if (!barcode) {
            setShowErrorModal({visible: true, message: 'Bitte geben Sie einen Barcode ein.'});
            return;
        }

        setLoading(true);
        let productData: NewFood | null = null;

        try {
            const response = await fetch(`https://world.openfoodfacts.org/api/v0/product/${barcode}.json`);
            if (!response.ok) {
                setShowErrorModal({visible: true, message: 'Netzwerkantwort war nicht ok.'});
                setLoading(false);
                return;
            }
            const data = await response.json();

            if (data.status === 1) {
                const product = data["product"];
                productData = {
                    name: product.product_name || '',
                    brands: product.brands || '',
                    location: '',
                    barcode: barcode,
                    quantity: 1,
                    expiryDate: '',
                    storageDate: format(new Date(), 'yyyy-MM-dd'),
                    image: product.image_small_url || ''
                };
            } else {
                setShowErrorModal({visible: true, message: 'Produkt nicht gefunden. Bitte manuell eingeben.'});
            }
        } catch (error) {
            console.error('Fehler beim Abrufen der Produktdaten:', error);
            setShowErrorModal({
                visible: true,
                message: 'Fehler beim Abrufen der Produktdaten. Bitte versuchen Sie es erneut.'
            });
        }

        if (productData) {
            setNewFood(prev => ({...prev, ...productData}));
        }
        setLoading(false);
    };

    // Handler für das Ergebnis des Barcode-Scanners
    const handleScanResult = (err: any, result: any) => {
        if (result && isScannerOpen) {
            const scannedBarcode = result.text;
            setIsScannerOpen(false); // Schließt den Scanner sofort
            setNewFood(prev => ({...prev, barcode: scannedBarcode}));
            // Ruft die Daten für den gescannten Code ab
            void handleFetchBarcodeData(scannedBarcode);
        }
        // Fehler werden ignoriert, um die Konsole nicht zu überfluten, da der Scanner kontinuierlich arbeitet
    };

    // Handler zum Hinzufügen/Aktualisieren eines Lebensmittels
    const handleAddOrUpdateFood = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!db) {
            console.error('Firestore ist nicht verfügbar.');
            return;
        }
        setLoading(true);
        const foodCollectionPath = `artifacts/${appId}/foodItems`;

        if (editingId) {
            // Eintrag aktualisieren
            try {
                const foodDocRef = doc(db, foodCollectionPath, editingId);
                await updateDoc(foodDocRef, {...newFood});
                setEditingId(null);
                setNewFood({name: '', brands: '', expiryDate: '', location: '', quantity: 1, barcode: '', image: '', storageDate: format(new Date(), 'yyyy-MM-dd')});
            } catch (e) {
                console.error('Fehler beim Aktualisieren des Eintrags:', e);
            }
        } else {
            // Neuen Eintrag hinzufügen oder Menge aktualisieren
            const existingFood = foods.find(
                f => f.name === newFood.name && f.brands === newFood.brands && f.expiryDate === newFood.expiryDate && f.location === newFood.location
            );

            try {
                if (existingFood) {
                    // Menge des bestehenden Eintrags aktualisieren
                    const foodDocRef = doc(db, foodCollectionPath, existingFood.id);
                    const newQuantity = existingFood.quantity + newFood.quantity;
                    await updateDoc(foodDocRef, {quantity: newQuantity});
                } else {
                    // Neuen Eintrag hinzufügen
                    await addDoc(collection(db, foodCollectionPath), {...newFood});
                }
                setNewFood({name: '', brands: '', expiryDate: '', location: '', quantity: 1, barcode: '', image: '', storageDate: format(new Date(), 'yyyy-MM-dd')});
            } catch (e) {
                console.error('Fehler beim Hinzufügen/Aktualisieren des Eintrags:', e);
            }
        }
        setLoading(false);
    };

    // Handler zum Bearbeiten eines Eintrags
    const handleEdit = (food: Food) => {
        setEditingId(food.id);
        setNewFood({
            name: food.name,
            brands: food.brands,
            expiryDate: food.expiryDate,
            storageDate: food.storageDate,
            location: food.location,
            quantity: food.quantity,
            barcode: food.barcode || '',
            image: food.image || ''
        });
    };

    // Handler zum Löschen eines Eintrags (bestätigen)
    const handleDeleteConfirm = (food: Food) => {
        setFoodToDelete(food);
        setShowDeleteModal(true);
    };

    // Handler zum Ausführen des Löschvorgangs
    const handleDelete = async () => {
        if (!db || !foodToDelete) {
            console.error('Firestore oder zu löschender Eintrag ist nicht verfügbar.');
            return;
        }
        setLoading(true);
        const foodCollectionPath = `artifacts/${appId}/foodItems`;
        try {
            const foodDocRef = doc(db, foodCollectionPath, foodToDelete.id);
            await deleteDoc(foodDocRef);
        } catch (e) {
            console.error('Fehler beim Löschen des Eintrags:', e);
        }
        setShowDeleteModal(false);
        setFoodToDelete(null);
        setLoading(false);
    };

    // Hilfsfunktion, um zu prüfen, ob ein Ablaufdatum bald erreicht ist
    const isExpiringSoon = (date: string) => {
        if (!date) return false;
        const expiryDate = new Date(date);
        const threeDaysFromNow = addDays(new Date(), 3); // addDays ist hier verständlicher
        return isBefore(expiryDate, threeDaysFromNow);
    };

    // Handler für den Login
    const handleLogin = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setAuthError(null);
        setLoading(true);
        const authService = getAuth();
        try {
            await signInWithEmailAndPassword(authService, email, password);
            // onAuthStateChanged wird den Rest erledigen
        } catch (error) {
            console.error("Login fehlgeschlagen:", error);
            setAuthError("Login fehlgeschlagen. Bitte E-Mail und Passwort überprüfen.");
        }
        setLoading(false);
    };

    // Handler für den Logout
    const handleLogout = async () => {
        const authService = getAuth();
        try {
            await signOut(authService);
        } catch (error) {
            console.error("Logout fehlgeschlagen:", error);
        }
    };

    // Gefilterte Liste basierend auf dem Suchbegriff
    const filteredFoods = foods.filter(food =>
        (food.name && food.name.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (food.brands && food.brands.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (food.location && food.location.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    if (!isAuthReady) {
        return (
            <div className="min-h-screen bg-gray-100 flex items-center justify-center">
                <p className="text-xl text-gray-600">Lade Authentifizierung...</p>
            </div>
        );
    }

    if (!userId) {
        return (
            <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-center p-4">
                <div className="max-w-md w-full bg-white shadow-xl rounded-2xl p-8 space-y-6">
                    <h2 className="text-center text-3xl font-extrabold text-gray-900">Anmelden</h2>
                    <form className="space-y-6" onSubmit={handleLogin}>
                        <div>
                            <label htmlFor="email-address" className="sr-only">Email-Adresse</label>
                            <input id="email-address" name="email" type="email" autoComplete="email" required
                                   className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                   placeholder="Email-Adresse" value={email} onChange={e => setEmail(e.target.value)}/>
                        </div>
                        <div>
                            <label htmlFor="password" className="sr-only">Passwort</label>
                            <input id="password" name="password" type="password" autoComplete="current-password"
                                   required
                                   className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                   placeholder="Passwort" value={password} onChange={e => setPassword(e.target.value)}/>
                        </div>
                        {authError && <p className="text-sm text-red-600 text-center">{authError}</p>}
                        <div>
                            <button type="submit" disabled={loading}
                                    className="w-full bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg shadow-md hover:bg-blue-700 transition duration-200 disabled:bg-gray-400">
                                {loading ? 'Melde an...' : 'Anmelden'}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-center p-4 antialiased">
            {/* Scanner Modal */}
            {isScannerOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-75 flex flex-col items-center justify-center z-50">
                    <div className="bg-white p-4 rounded-lg shadow-xl w-full max-w-md relative">
                        <h3 className="text-lg font-bold text-center mb-4">Barcode scannen</h3>
                        <BarcodeScanner onUpdate={handleScanResult}/>
                        <button
                            onClick={() => setIsScannerOpen(false)}
                            className="absolute top-2 right-2 p-2 bg-red-500 text-white rounded-full hover:bg-red-600 transition"
                            title="Scanner schließen"
                        >
                            <X className="h-5 w-5"/>
                        </button>
                    </div>
                </div>
            )}
            <div className="max-w-4xl w-full bg-white shadow-xl rounded-2xl p-8 space-y-8">
                <header className="text-center relative">
                    <h1 className="text-4xl font-extrabold text-gray-800">Lebensmittel-Manager</h1>
                    <button onClick={handleLogout}
                            className="absolute top-0 right-0 p-2 text-gray-500 hover:text-red-600 hover:bg-red-100 rounded-full transition duration-200"
                            title="Abmelden">
                        <LogOut className="h-6 w-6"/>
                    </button>
                </header>

                {/* Formular zum Hinzufügen/Bearbeiten */}
                <form onSubmit={handleAddOrUpdateFood} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                        <div className="md:col-span-2">
                            <label htmlFor="barcode" className="text-sm font-medium text-gray-700">Barcode</label>
                            <div className="flex space-x-2 mt-1">
                                <input
                                    type="text"
                                    id="barcode"
                                    name="barcode"
                                    value={newFood.barcode}
                                    onChange={handleInputChange}
                                    onKeyDown={e => {
                                        if (e.key === "Enter") {
                                            void handleFetchBarcodeData()
                                        }
                                    }}
                                    placeholder="Barcode eingeben oder scannen"
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition duration-200"
                                />
                                <button
                                    type="button"
                                    onClick={() => setIsScannerOpen(true)}
                                    disabled={loading}
                                    className="p-2 bg-blue-600 text-white rounded-lg shadow-md hover:bg-blue-700 transition duration-200 disabled:bg-gray-400"
                                    title="Kamera-Scanner öffnen"
                                >
                                    <Camera className="h-5 w-5"/>
                                </button>
                            </div>
                        </div>

                        <div>
                            <label htmlFor="quantity" className="text-sm font-medium text-gray-700">Menge <span className="text-red-500">*</span></label>
                            <input
                                type="number"
                                id="quantity"
                                name="quantity"
                                value={newFood.quantity}
                                onChange={handleInputChange}
                                min="1"
                                required
                                className="w-full px-4 py-2 mt-1 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition duration-200"
                            />
                        </div>

                        <div>
                            <label htmlFor="brands" className="text-sm font-medium text-gray-700">Marke</label>
                            <input
                                type="text"
                                id="brands"
                                name="brands"
                                value={newFood.brands}
                                onChange={handleInputChange}
                                placeholder="Markenname"
                                className="w-full px-4 py-2 mt-1 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition duration-200"
                            />
                        </div>

                        <div>
                            <label htmlFor="name" className="text-sm font-medium text-gray-700">Name <span className="text-red-500">*</span></label>
                            <input
                                type="text"
                                id="name"
                                name="name"
                                value={newFood.name}
                                onChange={handleInputChange}
                                placeholder="Name des Lebensmittels"
                                required
                                className="w-full px-4 py-2 mt-1 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition duration-200"
                            />
                        </div>

                        <div>
                            <label htmlFor="expiryDate"
                                   className="text-sm font-medium text-gray-700">Ablaufdatum</label>
                            <input
                                type="date"
                                id="expiryDate"
                                name="expiryDate"
                                value={newFood.expiryDate}
                                onChange={handleInputChange}
                                className="w-full px-4 py-2 mt-1 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition duration-200"
                            />
                        </div>

                        <div>
                            <label htmlFor="storageDate"
                                   className="text-sm font-medium text-gray-700">Einlagerungsdatum <span className="text-red-500">*</span></label>
                            <input
                                type="date"
                                id="storageDate"
                                name="storageDate"
                                value={newFood.storageDate}
                                onChange={handleInputChange}
                                required
                                className="w-full px-4 py-2 mt-1 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition duration-200"
                            />
                        </div>

                        <div>
                            <label htmlFor="location" className="text-sm font-medium text-gray-700">Lagerort <span className="text-red-500">*</span></label>
                            <input
                                type="text"
                                id="location"
                                name="location"
                                value={newFood.location}
                                onChange={handleInputChange}
                                placeholder="Lagerort (z.B. Kühlschrank)"
                                required
                                className="w-full px-4 py-2 mt-1 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition duration-200"
                            />
                        </div>

                        <div className="md:col-span-4">
                            <button
                                type="submit"
                                disabled={loading || !newFood.name || !newFood.location || !newFood.quantity}
                                className="w-full bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg shadow-md hover:bg-blue-700 transition duration-200 disabled:bg-gray-400 flex items-center justify-center space-x-2"
                            >
                                {loading ? 'Lädt...' : editingId ? 'Speichern' : 'Hinzufügen'}
                                {!loading && !editingId && <Plus className="inline-block h-5 w-5"/>}
                            </button>
                        </div>
                    </div>
                </form>

                {/* Suchleiste */}
                <div className="relative mt-8">
                    <input
                        type="text"
                        placeholder="Suchen nach Name, Marke oder Lagerort..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full px-4 py-2 pl-10 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition duration-200"
                    />
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400"/>
                </div>

                {/* Lebensmittelliste */}
                <div className="mt-8">
                    <h2 className="text-2xl font-bold text-gray-700 mb-4">Ihre Lebensmittel</h2>
                    {loading && <p className="text-center text-gray-500">Lädt...</p>}
                    {!loading && filteredFoods.length === 0 &&
                        <p className="text-center text-gray-500">Keine Lebensmittel gefunden.</p>}
                    {!loading && filteredFoods.length > 0 && (
                        <div className="space-y-4">
                            {filteredFoods.map((food) => (
                                <div
                                    key={food.id}
                                    className={`flex items-center justify-between p-4 rounded-lg shadow-sm transition-all duration-200 
                    ${isExpiringSoon(food.expiryDate) ? 'bg-red-50 ring-2 ring-red-400' : 'bg-gray-50 hover:bg-gray-100'}`}
                                >
                                    <div className="flex items-center space-x-4 flex-1">
                                        {food.image && (
                                            <img
                                                src={food.image}
                                                alt={`Bild von ${food.name}`}
                                                className="w-16 h-16 object-cover rounded-lg shadow-sm"
                                                onError={(e) => {
                                                    const target = e.target as HTMLImageElement;
                                                    target.onerror = null;
                                                    target.src = `https://placehold.co/64x64/E2E8F0/1A202C?text=Kein+Bild`;
                                                }}
                                            />
                                        )}
                                        <div>
                                            <p className="text-lg font-semibold text-gray-800">
                                                {food.brands ? `${food.brands} - ` : ''}{food.name}
                                            </p>
                                            <p className="text-sm text-gray-600">Ablaufdatum: {food.expiryDate ? format(new Date(food.expiryDate), 'dd.MM.yyyy') : 'Unbekannt'}</p>
                                            <p className="text-sm text-gray-600">Lagerort: {food.location}</p>
                                            <p className="text-sm text-gray-600">Menge: {food.quantity}</p>
                                        </div>
                                    </div>
                                    <div className="flex space-x-2">
                                        <button
                                            onClick={() => handleEdit(food)}
                                            className="p-2 bg-yellow-400 text-white rounded-full shadow-md hover:bg-yellow-500 transition duration-200"
                                            title="Bearbeiten"
                                        >
                                            <Pencil className="h-5 w-5"/>
                                        </button>
                                        <button
                                            onClick={() => handleDeleteConfirm(food)}
                                            className="p-2 bg-red-500 text-white rounded-full shadow-md hover:bg-red-600 transition duration-200"
                                            title="Löschen"
                                        >
                                            <Trash2 className="h-5 w-5"/>
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Löschbestätigungsmodal */}
            {showDeleteModal && foodToDelete && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-xl p-6 shadow-2xl max-w-sm w-full space-y-4">
                        <h3 className="text-xl font-bold text-gray-800">Eintrag löschen</h3>
                        <p className="text-gray-600">
                            Möchten Sie den Eintrag für "<span
                            className="font-semibold">{foodToDelete.name}</span>" wirklich löschen?
                        </p>
                        <div className="flex justify-end space-x-4">
                            <button
                                onClick={() => setShowDeleteModal(false)}
                                className="px-4 py-2 text-gray-600 rounded-lg hover:bg-gray-200 transition duration-200"
                            >
                                Abbrechen
                            </button>
                            <button
                                onClick={handleDelete}
                                className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition duration-200"
                            >
                                Löschen
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Fehlermodal für Barcode */}
            {showErrorModal.visible && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-xl p-6 shadow-2xl max-w-sm w-full space-y-4">
                        <h3 className="text-xl font-bold text-red-600">Fehler</h3>
                        <p className="text-gray-600">{showErrorModal.message}</p>
                        <div className="flex justify-end">
                            <button
                                onClick={() => setShowErrorModal({visible: false, message: ''})}
                                className="px-4 py-2 text-white bg-red-500 rounded-lg hover:bg-red-600 transition duration-200"
                            >
                                Schließen
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
