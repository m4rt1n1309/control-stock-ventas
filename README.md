# Kiosco — Stock y Caja

App web para el celular: escanear códigos de barra con la cámara para cargar productos, manejar stock, precios y cobrar.

- **Caja**: escaneás productos (o buscás por nombre), calcula total y vuelto, descuenta stock.
- **Cargar**: escaneás un código → si no existe, lo das de alta (autocompleta el nombre con Open Food Facts cuando puede); si existe, sumás stock o cambiás precio.
- **Productos**: listado, búsqueda, alerta de stock bajo, aumento de precios por % (todos o por categoría).
- **Ventas**: resumen del día por medio de pago y detalle de cada venta.

Stack: React + Vite, Supabase (Postgres + login), html5-qrcode. Deploy en Vercel.

**App online:** https://control-stock-ventas-delta.vercel.app — cada `git push` a `main` la vuelve a publicar sola.

---

## 1. Crear la base de datos (Supabase, gratis)

1. Entrá a https://supabase.com, creá una cuenta y un **New project** (región: São Paulo es la más cercana).
2. Andá a **SQL Editor → New query**, pegá todo el contenido de `supabase/schema.sql` y tocá **Run**.
   Después ejecutá, en orden, cada archivo de `supabase/migrations/` (ej: `002_stock_no_negativo.sql`).
3. **Authentication → Sign In / Providers → Email**: desactivá **"Allow new users to sign up"**
   (así solo entran los usuarios que vos crees).
4. **Authentication → Users → Add user → Create new user**: creá un usuario (email + contraseña)
   por cada persona que va a usar la app. Marcá "Auto Confirm User".
5. **Project Settings → API**: copiá la **Project URL** y la **anon public key**.

## 2. Probar en la PC

```bash
copy .env.example .env      # y completá los dos valores
npm install
npm run dev
```

Abrí http://localhost:5173

### Probar desde el celular (misma red WiFi)

```bash
npm run dev:celular
```

Abrí en el celular la dirección `https://192.168.x.x:5173` que muestra la consola.
El navegador va a avisar que el certificado no es seguro → "Avanzado" → "Continuar". (Es normal, solo pasa en desarrollo.)

## 3. Publicar en internet (Vercel, gratis)

1. Subí esta carpeta a un repositorio de GitHub.
2. En https://vercel.com → **Add New → Project** → elegí el repo (detecta Vite solo).
3. En **Environment Variables** agregá `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`.
4. **Deploy**. Te da una URL `https://tu-kiosco.vercel.app`.

En el celular abrí esa URL y en el menú del navegador elegí **"Agregar a pantalla principal"**: queda como una app.

---

## Notas

- La cámara **solo funciona con HTTPS** (Vercel ya lo tiene).
- Las ventas se registran con una función en la base (`register_sale`) que usa los precios guardados, descuenta stock y deja el movimiento, todo junto.
- No se puede vender ni restar más de lo que hay en stock (lo controla la app y también la base de datos).
- Cada movimiento de stock (entrada, venta, ajuste) queda registrado con usuario y fecha.
