using System.Collections.Generic;
using UnityEngine;

namespace RuinedSeoul.Mvp
{
    // The game chooses a POI; this only finds the visible walking route.
    public static class GridPathfinder
    {
        public static List<Vector2Int> Find(
            Vector2Int start,
            Vector2Int goal,
            int width,
            int height,
            HashSet<Vector2Int> blocked)
        {
            var open = new List<Vector2Int> { start };
            var cameFrom = new Dictionary<Vector2Int, Vector2Int>();
            var cost = new Dictionary<Vector2Int, int> { [start] = 0 };
            var directions = new[]
            {
                Vector2Int.up, Vector2Int.right, Vector2Int.down, Vector2Int.left
            };

            while (open.Count > 0)
            {
                var best = 0;
                for (var i = 1; i < open.Count; i++)
                {
                    if (Score(open[i]) < Score(open[best])) best = i;
                }

                var current = open[best];
                open.RemoveAt(best);
                if (current == goal)
                {
                    var path = new List<Vector2Int>();
                    while (current != start)
                    {
                        path.Add(current);
                        current = cameFrom[current];
                    }
                    path.Reverse();
                    return path;
                }

                foreach (var direction in directions)
                {
                    var next = current + direction;
                    if (next.x < 0 || next.y < 0 || next.x >= width || next.y >= height || blocked.Contains(next))
                        continue;

                    var nextCost = cost[current] + 1;
                    if (cost.TryGetValue(next, out var oldCost) && nextCost >= oldCost) continue;
                    cost[next] = nextCost;
                    cameFrom[next] = current;
                    if (!open.Contains(next)) open.Add(next);
                }
            }

            return null;

            int Score(Vector2Int cell)
            {
                return cost[cell] + Mathf.Abs(goal.x - cell.x) + Mathf.Abs(goal.y - cell.y);
            }
        }
    }
}
