using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.Tilemaps;
using UnityEngine.UI;

namespace RuinedSeoul.Mvp
{
    // A self-contained forest vertical slice. The existing web game remains the rules reference.
    public sealed class ForestMvp : MonoBehaviour
    {
        private const int Width = 9;
        private const int Height = 7;
        private readonly HashSet<Vector2Int> blocked = new HashSet<Vector2Int>
        {
            new Vector2Int(1, 6), new Vector2Int(8, 6)
        };
        private readonly Dictionary<string, int> items = new Dictionary<string, int>();
        private readonly Vector2Int[] points =
        {
            new Vector2Int(1, 5), // fallen fence: wood
            new Vector2Int(7, 3), // abandoned sign: search
            new Vector2Int(7, 1)  // brush: cordage and food
        };

        private Grid grid;
        private Camera worldCamera;
        private RenderTexture worldView;
        private Transform backdrop;
        private Sprite backdropSprite;
        private Transform player;
        private Vector2Int playerCell = new Vector2Int(4, 1);
        private Text clockText;
        private Text narrativeText;
        private Text locationText;
        private readonly List<Button> choiceButtons = new List<Button>();
        private readonly List<Text> choiceLabels = new List<Text>();
        private readonly List<Text> choiceMetaLabels = new List<Text>();
        private readonly List<RectTransform> statusChips = new List<RectTransform>();
        private readonly List<Text> dockLabels = new List<Text>();
        private RectTransform safeRoot;
        private RectTransform statusStrip;
        private RectTransform timeChip;
        private RectTransform stage;
        private RectTransform sceneArt;
        private RectTransform dock;
        private RectTransform dockPanel;
        private RawImage sceneImage;
        private Text dockPanelTitle;
        private Text dockPanelContent;
        private Canvas uiCanvas;
        private Rect lastSafeArea;
        private Vector2Int lastScreenSize;
        private Font font;
        private int day = 1;
        private int minute = 9 * 60;
        private int axeDurability = 8;
        private int knifeDurability = 10;
        private int currentPoint = -1;
        private int visibleChoiceCount;
        private string openDock;
        private bool walking;

        private void Awake()
        {
            font = Resources.Load<Font>("KoPubBatangMedium");
            if (font == null) font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
            BuildWorld();
            BuildUi();
            ShowMainChoices();
            SetNarrative("숲", "무너진 울타리와 젖은 낙엽 사이에 자재가 남아 있습니다. 가고 싶은 곳을 선택하면 캐릭터가 자동으로 걸어갑니다.");
            UpdateStatus();
        }

        private void Update()
        {
            if (lastSafeArea != Screen.safeArea ||
                lastScreenSize.x != Screen.width || lastScreenSize.y != Screen.height)
            {
                ApplySafeArea();
                LayoutUi();
            }
        }

        private void BuildWorld()
        {
            var gridObject = new GameObject("Isometric Forest Grid");
            grid = gridObject.AddComponent<Grid>();
            grid.cellLayout = GridLayout.CellLayout.Isometric;
            grid.cellSize = new Vector3(1f, .5f, 1f);

            var floorObject = new GameObject("Floor Tilemap");
            floorObject.transform.SetParent(gridObject.transform, false);
            var floor = floorObject.AddComponent<Tilemap>();
            // Keep the cell map as hidden scene data; the painted clearing supplies its visible ground.
            floorObject.AddComponent<TilemapRenderer>().enabled = false;

            var grass = MakeTile(new Color32(61, 91, 68, 255), new Color32(43, 68, 54, 255));
            var darkGrass = MakeTile(new Color32(54, 81, 62, 255), new Color32(36, 60, 48, 255));
            var path = MakeTile(new Color32(102, 94, 72, 255), new Color32(68, 65, 53, 255));
            for (var y = 0; y < Height; y++)
            for (var x = 0; x < Width; x++)
            {
                var cell = new Vector3Int(x, y, 0);
                floor.SetTile(cell, y == 1 || x == 4 ? path : (x + y) % 3 == 0 ? darkGrass : grass);
            }

            foreach (var cell in blocked) Decoration("막힌 나무", cell, "Evergreen", 2.3f);
            Decoration("무너진 울타리", points[0], "WoodPile", 1.15f);
            Decoration("낡은 안내판", points[1], "TrailSign", 1.85f);
            Decoration("덤불", points[2], "Bramble", 1.12f);

            var playerObject = new GameObject("Survivor");
            var sprite = playerObject.AddComponent<SpriteRenderer>();
            sprite.sprite = LoadArt("Survivor", 1.45f);
            sprite.sortingOrder = 10;
            player = playerObject.transform;
            player.position = CellPosition(playerCell) + Vector3.up * .18f;

            var cameraObject = new GameObject("Main Camera");
            cameraObject.tag = "MainCamera";
            var camera = cameraObject.AddComponent<Camera>();
            worldCamera = camera;
            camera.orthographic = true;
            camera.orthographicSize = Mathf.Max(4.3f, 3.8f / camera.aspect);
            camera.clearFlags = CameraClearFlags.SolidColor;
            camera.backgroundColor = new Color32(28, 40, 34, 255);
            var middle = CellPosition(new Vector2Int(4, 3));
            cameraObject.transform.position = new Vector3(middle.x, middle.y, -10);
            camera.orthographicSize = 2.4f;
            worldView = new RenderTexture(1536, 320, 16, RenderTextureFormat.ARGB32);
            worldView.filterMode = FilterMode.Bilinear;
            worldView.Create();
            camera.targetTexture = worldView;
            camera.aspect = (float)worldView.width / worldView.height;

            var backdropObject = new GameObject("Painted Forest Clearing");
            var backdropRenderer = backdropObject.AddComponent<SpriteRenderer>();
            var backdropTexture = Resources.Load<Texture2D>("Art/ForestBackdrop");
            backdropTexture.filterMode = FilterMode.Point;
            backdropSprite = Sprite.Create(backdropTexture,
                new Rect(0, 0, backdropTexture.width, backdropTexture.height),
                new Vector2(.5f, .5f), 100f);
            backdropRenderer.sprite = backdropSprite;
            backdropRenderer.sortingOrder = -100;
            backdrop = backdropObject.transform;
            FitBackdrop();
        }

        private Vector3 CellPosition(Vector2Int cell)
        {
            // The painted clearing has a shallower angle than Unity's default isometric tile projection.
            return new Vector3((cell.x - 4) * .72f - (cell.y - 3) * .15f,
                (cell.y - 3) * .45f + (cell.x - 4) * .08f, 0f);
        }

        private Tile MakeTile(Color32 surface, Color32 rim)
        {
            var texture = new Texture2D(64, 32, TextureFormat.RGBA32, false);
            texture.filterMode = FilterMode.Point;
            for (var y = 0; y < 32; y++)
            for (var x = 0; x < 64; x++)
            {
                var distance = Mathf.Abs(x - 31.5f) / 31.5f + Mathf.Abs(y - 15.5f) / 15.5f;
                var inside = distance <= 1f;
                var edge = distance > .87f || y < 3;
                texture.SetPixel(x, y, inside ? edge ? rim : surface : new Color32(0, 0, 0, 0));
            }
            texture.Apply();
            var tile = ScriptableObject.CreateInstance<Tile>();
            tile.sprite = Sprite.Create(texture, new Rect(0, 0, 64, 32), new Vector2(.5f, .5f), 64);
            return tile;
        }

        private void FitBackdrop()
        {
            if (backdrop == null || backdropSprite == null) return;
            var visibleHeight = worldCamera.orthographicSize * 2f;
            var visibleWidth = visibleHeight * worldCamera.aspect;
            var scale = Mathf.Max(visibleWidth / backdropSprite.bounds.size.x,
                visibleHeight / backdropSprite.bounds.size.y);
            backdrop.localScale = Vector3.one * scale;
            backdrop.position = new Vector3(worldCamera.transform.position.x,
                worldCamera.transform.position.y, 1f);
        }

        private void Decoration(string name, Vector2Int cell, string art, float height)
        {
            var objectGameObject = new GameObject(name);
            var renderer = objectGameObject.AddComponent<SpriteRenderer>();
            renderer.sprite = LoadArt(art, height);
            renderer.sortingOrder = 2;
            objectGameObject.transform.position = CellPosition(cell) + Vector3.up * .16f;
        }

        private Sprite LoadArt(string name, float worldHeight)
        {
            var texture = Resources.Load<Texture2D>("Art/" + name);
            if (texture == null)
            {
                Debug.LogError("Missing forest art: " + name);
                return null;
            }
            texture.filterMode = FilterMode.Point;
            var pixels = texture.GetPixels32();
            var minX = texture.width;
            var minY = texture.height;
            var maxX = 0;
            var maxY = 0;
            for (var y = 0; y < texture.height; y++)
            for (var x = 0; x < texture.width; x++)
            {
                if (pixels[y * texture.width + x].a < 24) continue;
                minX = Mathf.Min(minX, x);
                minY = Mathf.Min(minY, y);
                maxX = Mathf.Max(maxX, x);
                maxY = Mathf.Max(maxY, y);
            }
            if (minX > maxX || minY > maxY) return null;
            var rect = new Rect(minX, minY, maxX - minX + 1, maxY - minY + 1);
            return Sprite.Create(texture, rect, new Vector2(.5f, 0f), rect.height / worldHeight);
        }

        private void BuildUi()
        {
            var canvasObject = new GameObject("Canvas", typeof(RectTransform), typeof(Canvas),
                typeof(CanvasScaler), typeof(GraphicRaycaster));
            uiCanvas = canvasObject.GetComponent<Canvas>();
            uiCanvas.renderMode = RenderMode.ScreenSpaceOverlay;
            var scaler = canvasObject.GetComponent<CanvasScaler>();
            scaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
            scaler.referenceResolution = new Vector2(1280, 720);
            scaler.screenMatchMode = CanvasScaler.ScreenMatchMode.MatchWidthOrHeight;
            scaler.matchWidthOrHeight = .5f;

            var page = Solid("Soft page background", canvasObject.transform,
                new Color32(247, 249, 250, 255));
            Place(page, Vector2.zero, Vector2.one, Vector2.zero, Vector2.zero);

            safeRoot = new GameObject("Safe Area", typeof(RectTransform)).GetComponent<RectTransform>();
            safeRoot.SetParent(canvasObject.transform, false);
            ApplySafeArea();

            statusStrip = Card("Status strip", safeRoot, new Color32(255, 255, 255, 250),
                new Color32(229, 233, 235, 255), 24, true);
            MakeStatusChip("체력", new Color32(192, 59, 69, 255), .8f);
            MakeStatusChip("정신력", new Color32(59, 105, 199, 255), .6f);
            MakeStatusChip("기력", new Color32(224, 169, 43, 255), 7f / 15f);
            timeChip = Card("Time", statusStrip, Color.white,
                new Color32(230, 234, 236, 255), 18);
            clockText = Label("Clock", timeChip, 16, TextAnchor.MiddleCenter);
            Place(clockText.rectTransform, Vector2.zero, Vector2.one,
                new Vector2(4, 0), new Vector2(-4, 0));

            stage = Card("Story stage", safeRoot, Color.white,
                new Color32(230, 234, 236, 255), 28, true);
            stage.gameObject.AddComponent<Mask>().showMaskGraphic = true;
            sceneArt = Solid("Scene art", stage, new Color32(31, 45, 42, 255));
            var sceneImageObject = new GameObject("Live forest art", typeof(RectTransform), typeof(RawImage));
            sceneImageObject.transform.SetParent(sceneArt, false);
            sceneImage = sceneImageObject.GetComponent<RawImage>();
            sceneImage.texture = worldView;
            sceneImage.raycastTarget = false;
            Place(sceneImage.rectTransform, Vector2.zero, Vector2.one,
                Vector2.zero, Vector2.zero);

            locationText = Label("Scene location", stage, 17, TextAnchor.MiddleLeft);
            locationText.color = new Color32(47, 125, 104, 255);
            narrativeText = Label("Scene narrative", stage, 20, TextAnchor.UpperLeft);
            narrativeText.color = new Color32(43, 54, 64, 255);
            narrativeText.lineSpacing = 1.35f;
            narrativeText.verticalOverflow = VerticalWrapMode.Overflow;

            for (var i = 0; i < 3; i++)
            {
                var buttonObject = new GameObject("Choice " + (i + 1), typeof(RectTransform),
                    typeof(Image), typeof(Button));
                buttonObject.transform.SetParent(stage, false);
                var rect = buttonObject.GetComponent<RectTransform>();
                var buttonImage = buttonObject.GetComponent<Image>();
                buttonImage.sprite = MakeRoundedSprite(new Color32(248, 250, 249, 255),
                    new Color32(221, 228, 225, 255), 18);
                buttonImage.type = Image.Type.Sliced;
                var button = buttonObject.GetComponent<Button>();
                var colors = button.colors;
                colors.normalColor = Color.white;
                colors.highlightedColor = new Color32(228, 244, 238, 255);
                colors.pressedColor = new Color32(205, 229, 219, 255);
                colors.disabledColor = new Color32(220, 224, 222, 255);
                button.colors = colors;
                var label = Label("Choice title", rect, 20, TextAnchor.MiddleLeft);
                label.color = new Color32(31, 41, 51, 255);
                var meta = Label("Choice detail", rect, 14, TextAnchor.MiddleLeft);
                meta.color = new Color32(101, 113, 125, 255);
                choiceButtons.Add(button);
                choiceLabels.Add(label);
                choiceMetaLabels.Add(meta);
            }

            dock = Solid("Utility dock", safeRoot, Color.white);
            var dockLine = Solid("Dock border", dock, new Color32(226, 231, 233, 255));
            Place(dockLine, new Vector2(0, 1), new Vector2(1, 1),
                new Vector2(0, -1), Vector2.zero);
            foreach (var name in new[] { "메뉴", "아이템", "상태", "퀘스트", "이동" })
            {
                var buttonObject = new GameObject(name, typeof(RectTransform), typeof(Image), typeof(Button));
                buttonObject.transform.SetParent(dock, false);
                buttonObject.GetComponent<Image>().color = Color.white;
                var button = buttonObject.GetComponent<Button>();
                var colors = button.colors;
                colors.normalColor = Color.white;
                colors.highlightedColor = new Color32(237, 248, 243, 255);
                colors.pressedColor = new Color32(218, 237, 227, 255);
                button.colors = colors;
                var dockName = name;
                button.onClick.AddListener(() => ToggleDock(dockName));
                var label = Label("Dock label", buttonObject.transform, 14, TextAnchor.MiddleCenter);
                label.color = new Color32(101, 113, 125, 255);
                label.text = name;
                Place(label.rectTransform, Vector2.zero, Vector2.one, Vector2.zero, Vector2.zero);
                dockLabels.Add(label);
            }

            dockPanel = Card("Utility panel", safeRoot, Color.white,
                new Color32(226, 231, 233, 255), 24, true);
            dockPanelTitle = Label("Panel title", dockPanel, 22, TextAnchor.MiddleLeft);
            dockPanelContent = Label("Panel content", dockPanel, 17, TextAnchor.UpperLeft);
            dockPanelContent.color = new Color32(80, 95, 101, 255);
            Place(dockPanelTitle.rectTransform, new Vector2(0, 1), new Vector2(1, 1),
                new Vector2(24, -56), new Vector2(-24, -18));
            Place(dockPanelContent.rectTransform, new Vector2(0, 0), new Vector2(1, 1),
                new Vector2(24, 18), new Vector2(-24, -60));
            dockPanel.gameObject.SetActive(false);

            new GameObject("EventSystem", typeof(EventSystem), typeof(StandaloneInputModule));
            Canvas.ForceUpdateCanvases();
            LayoutUi();
        }

        private void ApplySafeArea()
        {
            lastSafeArea = Screen.safeArea;
            var width = Mathf.Max(1, Screen.width);
            var height = Mathf.Max(1, Screen.height);
            safeRoot.anchorMin = new Vector2(lastSafeArea.xMin / width, lastSafeArea.yMin / height);
            safeRoot.anchorMax = new Vector2(lastSafeArea.xMax / width, lastSafeArea.yMax / height);
            safeRoot.offsetMin = Vector2.zero;
            safeRoot.offsetMax = Vector2.zero;
        }

        private void LayoutUi()
        {
            lastScreenSize = new Vector2Int(Screen.width, Screen.height);
            var compact = Screen.width <= 620 || Screen.height < 650 ||
                Screen.height > Screen.width;
            uiCanvas.GetComponent<CanvasScaler>().matchWidthOrHeight = compact ? .8f : .5f;
            Canvas.ForceUpdateCanvases();
            var unit = 1f / Mathf.Max(.01f, uiCanvas.scaleFactor);
            var widthPx = safeRoot.rect.width / unit;
            var heightPx = safeRoot.rect.height / unit;
            var contentPx = compact ? widthPx : Mathf.Min(1100f, widthPx - 24f);
            var margin = (safeRoot.rect.width - contentPx * unit) * .5f;
            var statusTop = compact ? 0f : 28f;
            var statusHeight = compact ? 44f : 52f;
            var stageTop = compact ? 44f : 90f;
            var dockHeight = 58f;
            var stageBottom = compact ? dockHeight : 82f;
            var stageHeight = heightPx - stageTop - stageBottom;
            var artHeight = compact ? (stageHeight < 600f ? 88f : 112f) :
                Mathf.Clamp(Mathf.Min(stageHeight * .41f, stageHeight - 322f), 145f, 300f);
            var padding = compact ? 18f : 30f;

            Place(statusStrip, new Vector2(0, 1), new Vector2(1, 1),
                new Vector2(margin, -(statusTop + statusHeight) * unit),
                new Vector2(-margin, -statusTop * unit));
            var inner = compact ? 5f : 8f;
            var gap = compact ? 5f : 8f;
            var timeWidth = compact ? 82f : 116f;
            var chipWidth = Mathf.Max(20f,
                (contentPx - inner * 2f - timeWidth - gap * 3f) / 3f);
            for (var i = 0; i < statusChips.Count; i++)
            {
                var left = inner + i * (chipWidth + gap);
                Place(statusChips[i], new Vector2(0, 0), new Vector2(0, 1),
                    new Vector2(left * unit, 6f * unit),
                    new Vector2((left + chipWidth) * unit, -6f * unit));
            }
            var timeLeft = inner + 3f * (chipWidth + gap);
            Place(timeChip, new Vector2(0, 0), new Vector2(0, 1),
                new Vector2(timeLeft * unit, 6f * unit),
                new Vector2((timeLeft + timeWidth) * unit, -6f * unit));

            Place(stage, Vector2.zero, Vector2.one,
                new Vector2(margin, stageBottom * unit),
                new Vector2(-margin, -stageTop * unit));
            Place(sceneArt, new Vector2(0, 1), new Vector2(1, 1),
                new Vector2(0, -artHeight * unit), Vector2.zero);
            var sourceAspect = (float)worldView.width / worldView.height;
            var targetAspect = contentPx / artHeight;
            if (targetAspect >= sourceAspect)
            {
                var visible = sourceAspect / targetAspect;
                sceneImage.uvRect = new Rect(0, (1f - visible) * .5f, 1, visible);
            }
            else
            {
                var visible = targetAspect / sourceAspect;
                sceneImage.uvRect = new Rect((1f - visible) * .5f, 0, visible, 1);
            }

            Place(locationText.rectTransform, new Vector2(0, 1), new Vector2(1, 1),
                new Vector2(padding * unit, -(artHeight + 51f) * unit),
                new Vector2(-padding * unit, -(artHeight + 20f) * unit));
            var narrativeBottom = compact ? (stageHeight < 600f ? 169f : 206f) : 115f;
            Place(narrativeText.rectTransform, new Vector2(0, 1), new Vector2(1, 1),
                new Vector2(padding * unit, -(artHeight + narrativeBottom) * unit),
                new Vector2(-padding * unit, -(artHeight + 59f) * unit));

            var rowHeight = compact ? 64f : 55f;
            var rowGap = 8f;
            var firstChoice = compact
                ? stageHeight - 16f - visibleChoiceCount * rowHeight -
                  Mathf.Max(0, visibleChoiceCount - 1) * rowGap
                : artHeight + 120f;
            for (var i = 0; i < choiceButtons.Count; i++)
            {
                var top = firstChoice + i * (rowHeight + rowGap);
                var rect = (RectTransform)choiceButtons[i].transform;
                Place(rect, new Vector2(0, 1), new Vector2(1, 1),
                    new Vector2(padding * unit, -(top + rowHeight) * unit),
                    new Vector2(-padding * unit, -top * unit));
                Place(choiceLabels[i].rectTransform, new Vector2(0, .42f), Vector2.one,
                    new Vector2(18f * unit, 0), new Vector2(-18f * unit, 0));
                Place(choiceMetaLabels[i].rectTransform, Vector2.zero, new Vector2(1, .48f),
                    new Vector2(18f * unit, 0), new Vector2(-18f * unit, 0));
                if (!choiceMetaLabels[i].gameObject.activeSelf)
                    Place(choiceLabels[i].rectTransform, Vector2.zero, Vector2.one,
                        new Vector2(18f * unit, 0), new Vector2(-18f * unit, 0));
            }

            Place(dock, Vector2.zero, new Vector2(1, 0),
                Vector2.zero, new Vector2(0, dockHeight * unit));
            for (var i = 0; i < dockLabels.Count; i++)
                Place((RectTransform)dockLabels[i].transform.parent,
                    new Vector2(i / 5f, 0), new Vector2((i + 1) / 5f, 1),
                    Vector2.zero, Vector2.zero);
            Place(dockPanel, Vector2.zero, new Vector2(1, 0),
                new Vector2(margin, (dockHeight + 8f) * unit),
                new Vector2(-margin, (dockHeight + 170f) * unit));
        }

        private void MakeStatusChip(string name, Color32 color, float progress)
        {
            var chip = Card(name, statusStrip, Color.white,
                new Color32(230, 234, 236, 255), 18);
            statusChips.Add(chip);
            var icon = Solid("Status icon", chip, Color.white);
            var iconImage = icon.GetComponent<Image>();
            iconImage.sprite = MakeStatusIcon(name, color);
            iconImage.preserveAspect = true;
            iconImage.raycastTarget = false;
            Place(icon, new Vector2(0, .5f), new Vector2(0, .5f),
                new Vector2(9, -9), new Vector2(27, 9));
            var meter = Card("Meter", chip, new Color32(237, 240, 241, 255),
                new Color32(237, 240, 241, 255), 8);
            Place(meter, new Vector2(0, .5f), new Vector2(1, .5f),
                new Vector2(31, -4), new Vector2(-10, 4));
            var fill = Solid("Meter fill", meter, color);
            Place(fill, Vector2.zero, new Vector2(progress, 1),
                Vector2.zero, Vector2.zero);
            var button = chip.gameObject.AddComponent<Button>();
            button.onClick.AddListener(() => ToggleDock("상태"));
        }

        private RectTransform Solid(string name, Transform parent, Color32 color)
        {
            var obj = new GameObject(name, typeof(RectTransform), typeof(Image));
            obj.transform.SetParent(parent, false);
            obj.GetComponent<Image>().color = color;
            return obj.GetComponent<RectTransform>();
        }

        private RectTransform Card(string name, Transform parent, Color32 fill,
            Color32 border, float radius, bool shadow = false)
        {
            var rect = Solid(name, parent, Color.white);
            var image = rect.GetComponent<Image>();
            image.sprite = MakeRoundedSprite(fill, border, radius);
            image.type = Image.Type.Sliced;
            if (shadow)
            {
                var effect = rect.gameObject.AddComponent<Shadow>();
                effect.effectColor = new Color32(32, 48, 55, 24);
                effect.effectDistance = new Vector2(0, -7);
            }
            return rect;
        }

        private Sprite MakeRoundedSprite(Color32 fill, Color32 border, float radius)
        {
            var texture = new Texture2D(64, 64, TextureFormat.RGBA32, false);
            texture.filterMode = FilterMode.Bilinear;
            for (var y = 0; y < 64; y++)
            for (var x = 0; x < 64; x++)
            {
                var dx = Mathf.Abs(x + .5f - 32f) - (32f - radius);
                var dy = Mathf.Abs(y + .5f - 32f) - (32f - radius);
                var outside = Mathf.Sqrt(Mathf.Max(dx, 0) * Mathf.Max(dx, 0) +
                    Mathf.Max(dy, 0) * Mathf.Max(dy, 0));
                var distance = outside + Mathf.Min(Mathf.Max(dx, dy), 0) - radius;
                var coverage = Mathf.Clamp01(.5f - distance);
                var color = Color.Lerp((Color)border, (Color)fill,
                    Mathf.Clamp01(-distance / 1.5f));
                color.a *= coverage;
                texture.SetPixel(x, y, color);
            }
            texture.Apply();
            return Sprite.Create(texture, new Rect(0, 0, 64, 64),
                new Vector2(.5f, .5f), 64, 0, SpriteMeshType.FullRect,
                new Vector4(30, 30, 30, 30));
        }

        private Sprite MakeStatusIcon(string name, Color32 color)
        {
            var rows = name == "체력"
                ? new[] { ".###..###...", "#####.#####.", "###########.",
                    "###########.", ".#########..", "..#######...", "...#####....",
                    "....###.....", ".....#......" }
                : name == "정신력"
                    ? new[] { "...##..##...", ".##########.", "############",
                        "############", ".##########.", "..########..", "...######..." }
                    : new[] { ".......##...", "......##....", ".....##.....",
                        "....##......", "...######...", "......##....",
                        ".....##.....", "....##......", "...##......." };
            var texture = new Texture2D(16, 16, TextureFormat.RGBA32, false);
            texture.filterMode = FilterMode.Point;
            var empty = new Color32(0, 0, 0, 0);
            for (var y = 0; y < 16; y++)
            for (var x = 0; x < 16; x++)
            {
                var row = rows.Length - 1 - (y - (16 - rows.Length) / 2);
                texture.SetPixel(x, y, row >= 0 && row < rows.Length &&
                    x >= 2 && x - 2 < rows[row].Length && rows[row][x - 2] == '#'
                    ? color : empty);
            }
            texture.Apply();
            return Sprite.Create(texture, new Rect(0, 0, 16, 16), new Vector2(.5f, .5f), 16);
        }

        private Text Label(string name, Transform parent, int size, TextAnchor alignment)
        {
            var obj = new GameObject(name, typeof(RectTransform), typeof(Text));
            obj.transform.SetParent(parent, false);
            var label = obj.GetComponent<Text>();
            label.font = font;
            label.fontSize = size;
            label.color = new Color32(31, 41, 51, 255);
            label.alignment = alignment;
            label.horizontalOverflow = HorizontalWrapMode.Wrap;
            label.verticalOverflow = VerticalWrapMode.Truncate;
            return label;
        }

        private static void Place(RectTransform rect, Vector2 min, Vector2 max, Vector2 offsetMin, Vector2 offsetMax)
        {
            rect.anchorMin = min;
            rect.anchorMax = max;
            rect.offsetMin = offsetMin;
            rect.offsetMax = offsetMax;
        }

        private void SetNarrative(string title, string message)
        {
            locationText.text = title;
            narrativeText.text = message;
        }

        private void UpdateStatus()
        {
            clockText.text = day + "일차 " + minute / 60 + ":" +
                (minute % 60).ToString("00");
            if (!string.IsNullOrEmpty(openDock)) UpdateDockPanel();
        }

        private void ToggleDock(string name)
        {
            if (name == "이동")
            {
                openDock = null;
                dockPanel.gameObject.SetActive(false);
                ShowMainChoices();
            }
            else
            {
                openDock = openDock == name ? null : name;
                dockPanel.gameObject.SetActive(openDock != null);
                if (openDock != null) UpdateDockPanel();
            }
            foreach (var label in dockLabels)
                label.color = label.text == openDock
                    ? new Color32(47, 125, 104, 255)
                    : new Color32(101, 113, 125, 255);
        }

        private void UpdateDockPanel()
        {
            dockPanelTitle.text = openDock;
            switch (openDock)
            {
                case "아이템":
                    dockPanelContent.text = "목재 " + Count("wood") + "    끈 " + Count("cordage") +
                        "    식량 " + (Count("canned") + Count("greens") + Count("bread")) +
                        "    고철 " + Count("metal") + "    천 " + Count("cloth");
                    break;
                case "상태":
                    dockPanelContent.text = "체력 8/10    정신력 6/10    기력 7/15\n" +
                        "손도끼 " + axeDurability + "/8    간이 칼 " + knifeDurability + "/10";
                    break;
                case "퀘스트":
                    dockPanelContent.text = "구조 신호를 준비할 자재와 물자를 찾습니다.\n숲에서는 목재, 끈, 식량을 모을 수 있습니다.";
                    break;
                default:
                    dockPanelContent.text = "숲의 관심 지점을 선택하면 그곳까지 걸어갑니다.\n도착한 뒤 벌목, 수색, 채집을 할 수 있습니다.";
                    break;
            }
        }

        private int Count(string id) => items.TryGetValue(id, out var count) ? count : 0;

        private void Add(string id, int amount)
        {
            items[id] = Count(id) + amount;
        }

        private void Choices(params (string label, System.Action action)[] choices)
        {
            visibleChoiceCount = choices.Length;
            for (var i = 0; i < choiceButtons.Count; i++)
            {
                var visible = i < choices.Length;
                choiceButtons[i].gameObject.SetActive(visible);
                if (!visible) continue;
                choiceButtons[i].onClick.RemoveAllListeners();
                var action = choices[i].action;
                choiceButtons[i].onClick.AddListener(() => action());
                choiceButtons[i].interactable = !walking;
                var separator = choices[i].label.IndexOf('·');
                choiceLabels[i].text = separator < 0
                    ? choices[i].label : choices[i].label.Substring(0, separator).Trim();
                var meta = separator < 0 ? "" : choices[i].label.Substring(separator + 1).Trim();
                choiceMetaLabels[i].text = meta;
                choiceMetaLabels[i].gameObject.SetActive(meta.Length > 0);
            }
            LayoutUi();
        }

        private void OnDestroy()
        {
            if (worldView == null) return;
            if (worldCamera != null) worldCamera.targetTexture = null;
            worldView.Release();
            Destroy(worldView);
        }

        private void ShowMainChoices()
        {
            currentPoint = -1;
            Choices(
                ("무너진 울타리로 간다 · 벌목", () => GoTo(0)),
                ("낡은 안내판으로 간다 · 수색", () => GoTo(1)),
                ("덤불로 간다 · 덩굴과 먹을 것", () => GoTo(2)));
        }

        private void GoTo(int index)
        {
            if (walking) return;
            var route = GridPathfinder.Find(playerCell, points[index], Width, Height, blocked);
            if (route == null)
            {
                SetNarrative("이동 불가", "목적지까지 갈 수 있는 길이 없습니다.");
                return;
            }
            currentPoint = index;
            StartCoroutine(Walk(route));
        }

        private IEnumerator Walk(List<Vector2Int> route)
        {
            walking = true;
            foreach (var button in choiceButtons) button.interactable = false;
            SetNarrative("이동 중", "낙엽과 무너진 나무를 피해 걸어갑니다.");
            foreach (var cell in route)
            {
                var start = player.position;
                var end = CellPosition(cell) + Vector3.up * .18f;
                for (var elapsed = 0f; elapsed < .2f; elapsed += Time.deltaTime)
                {
                    player.position = Vector3.Lerp(start, end, Mathf.Clamp01(elapsed / .2f));
                    yield return null;
                }
                player.position = end;
                playerCell = cell;
            }
            walking = false;
            ShowPointChoices();
        }

        private void ShowPointChoices()
        {
            switch (currentPoint)
            {
                case 0:
                    SetNarrative("무너진 울타리", "마른 가지와 부서진 목재를 골라 챙길 수 있습니다.");
                    if (axeDurability > 0)
                        Choices(("벌목하기 · 목재 +3 / 30분", () => Act("chop")),
                            ("손도끼로 벌목 · 목재 +5 / 내구도 -1", () => Act("axe")),
                            ("다른 곳을 살핀다", ShowMainChoices));
                    else
                        Choices(("벌목하기 · 목재 +3 / 30분", () => Act("chop")),
                            ("다른 곳을 살핀다", ShowMainChoices));
                    break;
                case 1:
                    SetNarrative("낡은 안내판", "낙엽과 폐허를 뒤집니다. 빈손으로 돌아올 수도 있습니다.");
                    Choices(("수색하기 · 무작위 물자 / 30분", () => Act("search")),
                        ("다른 곳을 살핀다", ShowMainChoices));
                    break;
                case 2:
                    SetNarrative("덤불", "질긴 덩굴을 묶거나 먹을 것을 찾아볼 수 있습니다.");
                    Choices(("덩굴을 다룬다", ShowBushCordageChoices),
                        ("먹을 것을 뒤진다", ShowBushFoodChoices),
                        ("다른 곳을 살핀다", ShowMainChoices));
                    break;
            }
        }

        private void ShowBushCordageChoices()
        {
            SetNarrative("덤불 · 덩굴", "질긴 덩굴과 오래된 천막 끈을 묶을 수 있습니다.");
            if (knifeDurability > 0)
                Choices(("덩굴을 꼬아 끈 만들기 · 끈 +2", () => Act("cordage")),
                    ("간이 칼로 덩굴 자르기 · 끈 +4", () => Act("knifeCordage")),
                    ("덤불로 돌아간다", ShowPointChoices));
            else
                Choices(("덩굴을 꼬아 끈 만들기 · 끈 +2", () => Act("cordage")),
                    ("덤불로 돌아간다", ShowPointChoices));
        }

        private void ShowBushFoodChoices()
        {
            SetNarrative("덤불 · 먹을 것", "오래 살핀다고 반드시 식량이 나오지는 않습니다.");
            if (knifeDurability > 0)
                Choices(("먹을 것 뒤지기 · 무작위 결과", () => Act("forage")),
                    ("간이 칼로 덤불 뒤지기 · 무작위 결과", () => Act("knifeForage")),
                    ("덤불로 돌아간다", ShowPointChoices));
            else
                Choices(("먹을 것 뒤지기 · 무작위 결과", () => Act("forage")),
                    ("덤불로 돌아간다", ShowPointChoices));
        }

        private void Act(string action)
        {
            if (walking) return;
            minute += 30;
            if (minute >= 24 * 60)
            {
                minute -= 24 * 60;
                day++;
            }
            string result;
            switch (action)
            {
                case "chop":
                    Add("wood", 3);
                    result = "마른 나무와 부서진 가지에서 목재 판자 3개를 챙겼습니다.";
                    break;
                case "axe":
                    Add("wood", 5);
                    axeDurability--;
                    result = "손도끼로 울타리 목재를 쳐 내 판자 5개를 챙겼습니다.";
                    break;
                case "search":
                    result = Search();
                    break;
                case "cordage":
                    Add("cordage", 2);
                    result = "덩굴과 남은 끈을 꼬아 끈 묶음 2개를 만들었습니다.";
                    break;
                case "knifeCordage":
                    Add("cordage", 4);
                    knifeDurability--;
                    result = "칼로 덩굴을 잘라 끈 묶음 4개를 만들었습니다.";
                    break;
                case "forage":
                    result = Forage(false);
                    break;
                case "knifeForage":
                    knifeDurability--;
                    result = Forage(true);
                    break;
                default:
                    return;
            }
            UpdateStatus();
            SetNarrative("숲 · 행동 결과", result + " 30분이 지났습니다.");
            ShowMainChoices();
        }

        private string Search()
        {
            var roll = UnityEngine.Random.Range(0, 100);
            if (roll < 50) return "낙엽을 뒤졌지만 쓸 만한 물건을 찾지 못했습니다.";
            if (roll < 60) { Add("canned", 1); return "찌그러진 캔 음식 하나를 발견했습니다."; }
            if (roll < 80) { Add("wood", 1); return "쓸 만한 목재 판자 하나를 찾았습니다."; }
            if (roll < 90) { Add("metal", 1); return "고철 조각 하나를 주웠습니다."; }
            Add("cloth", 1);
            return "질긴 천 조각 하나를 건졌습니다.";
        }

        private string Forage(bool withKnife)
        {
            var roll = UnityEngine.Random.Range(0, 100);
            if (withKnife)
            {
                if (roll < 35) return "칼로 덤불을 헤쳤지만 먹을 것을 찾지 못했습니다.";
                if (roll < 70) { Add("greens", 1); return "먹을 수 있는 들풀 한 줌을 챙겼습니다."; }
                if (roll < 85) { Add("bread", 1); return "낡은 봉지에서 오래된 빵 하나를 찾았습니다."; }
                if (roll < 95) { Add("canned", 1); return "덤불 속 캔 음식 하나를 찾았습니다."; }
                Add("cloth", 1);
                return "먹을 것은 없지만 천 조각 하나를 챙겼습니다.";
            }
            if (roll < 55) return "먹을 만한 것을 찾지 못해 빈손으로 돌아왔습니다.";
            if (roll < 80) { Add("greens", 1); return "먹을 수 있는 들풀 한 줌을 뜯었습니다."; }
            if (roll < 90) { Add("bread", 1); return "젖은 봉지에서 오래된 빵 하나를 찾았습니다."; }
            Add("cloth", 1);
            return "먹을 것은 없지만 천 조각 하나를 챙겼습니다.";
        }
    }
}
