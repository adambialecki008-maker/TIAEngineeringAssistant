export async function postJson(
    url,
    payload
) {
    const response =
        await fetch(
            url,
            {
                method: "POST",

                headers: {
                    "Content-Type":
                        "application/json",
                },

                body:
                    JSON.stringify(payload),
            }
        );


    const data =
        await response.json();


    if (!response.ok) {
        throw new Error(
            JSON.stringify(data)
        );
    }


    return data;
}