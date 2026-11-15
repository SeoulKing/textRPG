using UnityEditor;

namespace RuinedSeoul.Mvp.Editor
{
    public sealed class ConfigureForestArt : AssetPostprocessor
    {
        private void OnPreprocessTexture()
        {
            if (!assetPath.StartsWith("Assets/Resources/Art/")) return;
            var importer = (TextureImporter)assetImporter;
            importer.textureType = TextureImporterType.Default;
            importer.isReadable = true;
            importer.mipmapEnabled = false;
            importer.filterMode = UnityEngine.FilterMode.Point;
            importer.textureCompression = TextureImporterCompression.Uncompressed;
            importer.alphaIsTransparency = true;
        }
    }
}
