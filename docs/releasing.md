# Publicar la CLI

El paquete npm se llama `@lakbast/create-my-saas`. Hasta `1.16.0` se publicó como
`@soymanolo/create-my-saas`, que queda deprecado; `upgrade` sigue descargando de
ahí las versiones antiguas. El workflow `.github/workflows/publish.yml` se activa
al subir un tag `v*`. Valida la versión, ejecuta las comprobaciones de la
CLI, inspecciona el contenido de npm, publica el paquete y crea la GitHub
Release con notas generadas a partir de su sección del changelog. La excepción es el tag de
arranque `v1.17.0`, detallado abajo.

## Configuración única antes de la primera publicación

1. Inicia sesión en npm con una cuenta propietaria de la organización `lakbast`
   y activa 2FA.
2. Crea el paquete público `@lakbast/create-my-saas` mediante la primera
   publicación manual. npm exige que el paquete exista antes de configurar una
   relación de confianza. No uses el token de npm en el repositorio ni en
   GitHub Actions.
3. En npm, abre **Packages → @lakbast/create-my-saas → Settings → Trusted
   Publisher** y registra GitHub Actions con estos valores:

   | Campo | Valor |
   | --- | --- |
   | Organización o usuario | `LAKBAST` |
   | Repositorio | `create-my-saas` |
   | Workflow | `publish.yml` |
   | Environment | dejar vacío |
   | Acción permitida | `npm publish` |

   Esta relación usa credenciales OIDC de corta duración. El workflow necesita
   `id-token: write` para solicitarlas, pero no guarda credenciales de npm.

4. Verifica que el paquete con scope `@lakbast` sea público. El workflow
   ejecuta `npm publish` sin `--access public`; no convierte un paquete privado
   en público.

El siguiente procedimiento corresponde al arranque de `1.17.0`, la primera
versión con el scope `@lakbast`, y no debe repetirse para una versión ya
publicada. La primera publicación manual del paquete con scope se realiza desde
la raíz de un checkout limpio de esa versión:

```sh
npm login
npm publish --access public
```

No copies el token de npm a este repositorio, a secretos de GitHub ni a un chat.
Después de esa publicación inicial, configura el proveedor de confianza y crea
el tag `v1.17.0`. El workflow confirma que `1.17.0` ya existe en npm y crea la
GitHub Release sin volver a publicar. Después, las publicaciones serán
automáticas. Por último, depreca el paquete anterior:

```sh
npm deprecate @soymanolo/create-my-saas "Movido a @lakbast/create-my-saas"
```

## Crear una release

Publica una nueva versión solo si cambia el contrato público de extensiones o
si hay mejoras reales en las plantillas públicas. No publiques una versión por
cambios internos que no afecten a esos dos ámbitos.

1. Elige una nueva versión SemVer, actualiza `version` en `package.json` y
   `packages/cli/package.json`, y
   añade su sección en `CHANGELOG.md`. El workflow usará el contenido de esa
   sección como descripción de la GitHub Release.
2. Ejecuta localmente las mismas comprobaciones:

   ```sh
   pnpm install --frozen-lockfile
   pnpm run validate:templates
   pnpm test
   npm pack --dry-run
   ```

3. Integra el cambio de versión en `main` y crea el tag anotado con esa misma
   versión:

   ```sh
   git tag -a vX.Y.Z -m "Release vX.Y.Z"
   git push origin vX.Y.Z
   ```

4. El workflow **Publish CLI** comprueba que `X.Y.Z` coincide exactamente con
   `package.json`. Si las verificaciones pasan, publica `@lakbast/create-my-saas`
   con la etiqueta `latest` y crea la GitHub Release `vX.Y.Z`.

No reutilices ni muevas tags publicados: npm no permite reemplazar una versión
existente. Para corregir una release, publica una nueva versión SemVer.

## Verificación posterior

Comprueba la versión publicada e instala la CLI sin usar el checkout:

```sh
npm view @lakbast/create-my-saas version
npx @lakbast/create-my-saas@latest example-saas --backend nestjs --frontend nextjs
```

La configuración efectiva de Trusted Publishing y la procedencia del paquete
se comprueban en npm y en el resultado de la publicación; el código del workflow
por sí solo no confirma que esa relación externa esté configurada.
