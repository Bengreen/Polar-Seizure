import asyncio
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        # Create a mobile context (320px width)
        context = await browser.new_context(
            viewport={'width': 320, 'height': 568},
            user_agent='Mozilla/5.0 (iPhone; CPU iPhone OS 10_3_1 like Mac OS X) AppleWebKit/603.1.30 (KHTML, like Gecko) Version/10.0 Mobile/14E304 Safari/602.1'
        )
        page = await context.new_page()

        # Mock authentication and API requests
        await page.add_init_script("""
            localStorage.setItem('auth_token', 'mock_token');
        """)

        await page.route("**/api/farms/*/fields/*", lambda route: route.fulfill(
            json={
                "id": "1",
                "farm_id": "1",
                "name": "Toberkeigh",
                "area_hectares": 2.0,
                "land_use": "arable",
                "min_elevation": 10,
                "max_elevation": 20,
                "average_slope": 5,
                "max_slope": 10,
                "geometry_geojson": "{\"type\":\"Polygon\",\"coordinates\":[[[-6.5,54.5],[-6.51,54.5],[-6.51,54.51],[-6.5,54.51],[-6.5,54.5]]]}"
            }
        ))

        await page.route("**/api/farms", lambda route: route.fulfill(json=[{"id": "1", "name": "Test Farm"}]))
        await page.route("**/api/farms/*/fields/*/events", lambda route: route.fulfill(json=[
            {"id": "e1", "field_id": "1", "event_type": "Planting", "date": "2024-03-01", "details": {}}
        ]))

        try:
            await page.goto("http://localhost:4200/farms/1/fields/1", timeout=15000)
            await page.wait_for_selector('text=Toberkeigh', timeout=10000)
            await page.wait_for_timeout(2000)  # Wait for map to load

            # Find overflowing elements
            overflowing = await page.evaluate("""() => {
                const elements = document.querySelectorAll('*');
                const overflowingElements = [];
                for (const el of elements) {
                    if (el.scrollWidth > window.innerWidth) {
                        overflowingElements.push({
                            tag: el.tagName,
                            className: el.className,
                            scrollWidth: el.scrollWidth,
                            clientWidth: el.clientWidth,
                            offsetWidth: el.offsetWidth,
                            text: el.textContent.substring(0, 30)
                        });
                    }
                }
                return {
                    windowWidth: window.innerWidth,
                    documentScrollWidth: document.documentElement.scrollWidth,
                    bodyScrollWidth: document.body.scrollWidth,
                    elements: overflowingElements
                };
            }""")

            print("Layout Analysis:")
            print(f"Window Width: {overflowing['windowWidth']}")
            print(f"Document Scroll Width: {overflowing['documentScrollWidth']}")
            print(f"Body Scroll Width: {overflowing['bodyScrollWidth']}")
            print("\nOverflowing Elements:")
            for el in overflowing['elements']:
                print(f"Tag: {el['tag']}, Class: {el['className']}, ScrollWidth: {el['scrollWidth']}, Text: {el['text']}")

        except Exception as e:
            print(f"Error: {e}")

        await browser.close()

if __name__ == "__main__":
    asyncio.run(main())
