## Qué cambia

<!-- Resume el cambio en pocas líneas. Si resuelve un issue, enlázalo: "Closes #123". -->

## Por qué

<!-- El problema que resuelve o la mejora que aporta. -->

## Cómo se ha probado

<!-- Comandos ejecutados y combinaciones de plantillas probadas. -->

- [ ] `npm run audit:public`
- [ ] `npm run validate:templates`
- [ ] `npm test`
- [ ] Verificación del README de cada plantilla modificada

## Checklist

- [ ] El PR resuelve una sola cosa y sigue la [guía de contribución](https://createmysaas.dev/referencia/contributing/).
- [ ] Si cambia el contrato HTTP, los backends y frontends afectados mantienen la equivalencia y `docs/template-parity.md` está al día.
- [ ] La documentación de `docs/` refleja el cambio.
- [ ] Si el cambio es visible para quien usa la CLI, hay una entrada en `[Unreleased]` de `CHANGELOG.md`.
- [ ] No incluye secretos, archivos `.env` reales ni artefactos generados.
