# Impure shell: uses whatever nixpkgs is on NIX_PATH.
# Enter with: nix-shell
# Then serve:  serve   (or: python -m http.server 8080)
{ pkgs ? import <nixpkgs> { } }:

pkgs.mkShell {
  packages = [
    pkgs.python3
  ];

  shellHook = ''
    serve() {
      local port="''${1:-8080}"
      echo "Serving see4pablo-mainpage at http://localhost:''${port}"
      echo "Ctrl+C to stop."
      python -m http.server "$port"
    }
    export -f serve
    echo "see4pablo-mainpage — run: serve   (or: serve 9000)"
  '';
}
