from PIL import Image
import os

# Definisce il nome del file di partenza
file_origine = "logo.jpg"

def crea_icona(dimensione, nome_output):
    # 1. Apre l'immagine originale
    img = Image.open(file_origine)

    # 2. Converte l'immagine nel formato colore RGBA (richiesto per i PNG standard)
    img = img.convert("RGBA")

    # 3. Ridimensiona forzatamente al quadrato della dimensione richiesta
    img_ridimensionata = img.resize((dimensione, dimensione), Image.Resampling.LANCZOS)

    # 4. Salva il nuovo file
    img_ridimensionata.save(nome_output, "PNG")
    print(f"File creato con successo: {nome_output}")

# Richiama la funzione per entrambe le dimensioni del manifest
crea_icona(192, "icon-192.png")
crea_icona(512, "icon-512.png")
