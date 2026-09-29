using RuinedSeoul.Mvp;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace RuinedSeoul.Mvp.Editor
{
    public static class CreateMvpScene
    {
        private const string ScenePath = "Assets/Scenes/ForestMvp.unity";

        [InitializeOnLoadMethod]
        private static void GenerateFirstScene()
        {
            EditorApplication.delayCall += () =>
            {
                if (EditorApplication.isPlayingOrWillChangePlaymode) return;

                if (AssetDatabase.LoadAssetAtPath<SceneAsset>(ScenePath) == null)
                    Generate();
                else if (!Application.isBatchMode &&
                         string.IsNullOrEmpty(EditorSceneManager.GetActiveScene().path))
                    EditorSceneManager.OpenScene(ScenePath);
            };
        }

        [MenuItem("Tools/Ruined Seoul/Recreate MVP Scene")]
        public static void Generate()
        {
            if (!AssetDatabase.IsValidFolder("Assets/Scenes"))
                AssetDatabase.CreateFolder("Assets", "Scenes");
            var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
            new GameObject("Forest MVP").AddComponent<ForestMvp>();
            EditorSceneManager.SaveScene(scene, ScenePath);
            EditorBuildSettings.scenes = new[] { new EditorBuildSettingsScene(ScenePath, true) };
            EditorSceneManager.OpenScene(ScenePath);
            Debug.Log("Forest MVP scene is ready. Press Play to try forest actions.");
        }
    }
}
