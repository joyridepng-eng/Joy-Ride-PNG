# Change workflow

1. Make changes on a separate branch.
2. Open a pull request into master.
3. Wait for all CI checks to finish successfully.
4. Review the changes before merging.
5. Let Render deploy the backend after CI passes.

Do not commit credentials, environment files, or backup files.
Keep regression checks enabled and fix failures before merging.
Mobile app changes also require appropriate APK and phone testing.
